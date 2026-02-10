import './style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import {
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_KEY_V6,
  STORAGE_WARNING_THRESHOLD_MB,
} from './constants.js';
import {
  extractServerFromDOM,
  extractUsefulData,
  findActiveTabByClass,
  locateChatElements,
} from './parser.js';
import {
  addMessageToSyntheticChannelIfNeeded,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  migrateDataV5toV6,
  saveMessagesToStorage,
} from './state.js';
import { createUI } from './ui.js';
import {
  debounce,
  formatISOTimeForDisplay,
  getISOTimestamp,
  getStorageUsageInMB,
} from './utils.js';

(() => {
  // --- 全局状态 ---
  let inMemoryChatState = {};
  let messageObserver = null;
  let tabObserver = null;
  let serverObserver = null;
  let currentActiveChannel = null;
  let detectedServerName = null;
  let isInitializingChat = false;
  let isSwitchingTabs = false;
  // UI 控制句柄
  let uiControls = null;

  /*
   * =================================================================
   * 核心功能模块
   * =================================================================
   */

  /** 扫描聊天框中已存在的消息，时间戳根据UI显示的 `HH:MM` 进行估算。*/
  function extractHistoricalChatState() {
    const elements = locateChatElements();
    if (!elements.tabs || !elements.chatLog) return { current_tab: null, messages: [] };

    const current_tab = findActiveTabByClass(elements.tabs.innerHTML);
    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const messages = [];
    const chatLines = Array.from(elements.chatLog.children);
    const currentDate = new Date();
    let lastTimeParts = null;

    for (let i = chatLines.length - 1; i >= 0; i--) {
      const element = chatLines[i];
      const timeNode = element.querySelector('.chat-line-timestamp');
      if (!timeNode || !timeNode.textContent.includes(':')) continue;

      const timeText = timeNode.textContent.trim();
      const [hours, minutes] = timeText.split(':').map(Number);
      if (
        lastTimeParts &&
        (hours > lastTimeParts.hours ||
          (hours === lastTimeParts.hours && minutes > lastTimeParts.minutes))
      ) {
        currentDate.setDate(currentDate.getDate() - 1);
      }
      lastTimeParts = { hours, minutes };

      const localDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')} ${timeText}`;
      const isoTimeApproximation = new Date(localDateString.replace(/-/g, '/')).toISOString();

      const messageData = extractUsefulData(element, selfName, isoTimeApproximation);
      if (messageData?.content) {
        messageData.is_historical = true;
        messages.push(messageData);
      }
    }
    messages.reverse();
    return { current_tab, messages };
  }

  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  function scanAndMergeHistory() {
    if (!detectedServerName) return; // 未知服务器不录制

    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    // 确保当前服务器在内存中有对象
    if (!inMemoryChatState[detectedServerName]) {
        inMemoryChatState[detectedServerName] = {};
    }
    const serverData = inMemoryChatState[detectedServerName];

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      const oldMessages = serverData[channelName] || [];
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      if (newMergedMessages.length > oldMessages.length) {
        serverData[channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(oldMessages.length);
        for (const msg of newlyAddedHistoricalMessages) {
          addMessageToSyntheticChannelIfNeeded(serverData, msg, channelName);
        }
      }
    }
    if (dataChanged && uiControls && !uiControls.isUIPaused()) {
      uiControls.updateUI();
    }
  }

  /*
   * =================================================================
   * 脚本主程序与生命周期管理
   * =================================================================
   */

  /** 处理 MutationObserver 捕获到的新消息节点。*/
  function handleNewChatMessage(node) {
    if (isInitializingChat || isSwitchingTabs) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!currentActiveChannel || !detectedServerName) return;

    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      if (!inMemoryChatState[detectedServerName]) {
          inMemoryChatState[detectedServerName] = {};
      }
      const serverData = inMemoryChatState[detectedServerName];

      if (!serverData[currentActiveChannel]) {
        serverData[currentActiveChannel] = [];
      }
      serverData[currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(serverData, messageData, currentActiveChannel);

      if (uiControls && !uiControls.isUIPaused()) {
        uiControls.updateUI();
      }
    }
  }

  /**
   * 激活聊天记录器。
   */
  function activateLogger() {
    const { chatLog, tabs: tabsContainer } = locateChatElements();
    if (!chatLog || !tabsContainer || messageObserver) return;

    isInitializingChat = true;

    const handleTabChange = () => {
      const newActiveTab = findActiveTabByClass(tabsContainer.innerHTML);
      if (newActiveTab && newActiveTab !== currentActiveChannel) {
        currentActiveChannel = newActiveTab;
        isSwitchingTabs = true;
        setTimeout(() => {
          scanAndMergeHistory();
          isSwitchingTabs = false;
        }, 250);
      }
    };

    currentActiveChannel = findActiveTabByClass(tabsContainer.innerHTML);
    tabObserver = new MutationObserver(handleTabChange);
    tabObserver.observe(tabsContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    const finalizeInitialization = debounce(() => {
      scanAndMergeHistory();
      isInitializingChat = false;
    }, 500);

    messageObserver = new MutationObserver((mutationsList) => {
      let hasNewNodes = false;
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          if (!isInitializingChat) {
            mutation.addedNodes.forEach(handleNewChatMessage);
          }
        }
      }
      if (isInitializingChat && hasNewNodes) {
        finalizeInitialization();
      }
    });

    messageObserver.observe(chatLog, { childList: true });
    finalizeInitialization();
  }

  /** 停用并清理聊天记录器。*/
  function deactivateLogger() {
    if (messageObserver) {
      messageObserver.disconnect();
      messageObserver = null;
    }
    if (tabObserver) {
      tabObserver.disconnect();
      tabObserver = null;
    }
    isInitializingChat = false;
    isSwitchingTabs = false;
    currentActiveChannel = null;
  }

  /** 脚本主入口函数。*/
  function main() {
    migrateDataV4toV5();
    inMemoryChatState = loadMessagesFromStorage();
    uiControls = createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage,
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
    });

    uiControls.checkStorageUsage();

    // --- 启动服务器检测观察者 ---
    const updateServer = () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] 检测到服务器切换: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }
        
        // 尝试迁移 V5 数据 (如果存在)
        const oldData = localStorage.getItem(STORAGE_KEY_V5);
        if (oldData) {
            const shouldMigrate = confirm(
                `[聊天存档 V6 升级]\n\n检测到旧版本存档！\n\n是否将旧数据归并到当前检测到的服务器：\n>> ${server} <<\n\n[确定]: 是的，这是我之前玩的服务器。\n[取消]: 不，我要换个服务器再合并。`
            );
            if (shouldMigrate) {
                const newData = migrateDataV5toV6(server);
                if (newData) {
                    inMemoryChatState = newData;
                    // Force UI Refresh
                    uiControls.updateUI(); 
                }
            }
        }
      }
    };

    serverObserver = new MutationObserver(updateServer);
    serverObserver.observe(document.body, { childList: true, subtree: true });
    updateServer(); // 立即执行一次

    const uiObserver = new MutationObserver(() => {
      const { chatLogContainer } = locateChatElements();
      if (chatLogContainer) {
        const isVisible = chatLogContainer.style.display !== 'none';
        if (isVisible && !messageObserver) {
          activateLogger();
        } else if (!isVisible && messageObserver) {
          deactivateLogger();
        }
      } else if (messageObserver) {
        deactivateLogger();
      }
    });
    uiObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

    setInterval(() => {
      saveMessagesToStorage(inMemoryChatState);
      uiControls.checkStorageUsage();
    }, 15000);

    let lastDuplicateCount = -1;
    setInterval(() => {
      const duplicateCount = detectTotalDuplicates(inMemoryChatState);
      if (duplicateCount !== lastDuplicateCount) {
        // This function is now internal to the UI module but can be triggered.
        // For now, the UI will handle this itself periodically.
        // If more direct control is needed, ui.js could expose a function for it.
        lastDuplicateCount = duplicateCount;
      }
    }, 5000);

    window.addEventListener('pagehide', () => saveMessagesToStorage(inMemoryChatState));
  }

  if (document.readyState === 'complete') {
    main();
  } else {
    window.addEventListener('load', main);
  }
})();
