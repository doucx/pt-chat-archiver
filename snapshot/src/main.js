import './style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import {
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
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
  migrateV5toV6,
  saveMessagesToStorage,
} from './state.js';
import { storage } from './storage.js';
import { createUI } from './ui/index.js';
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
    if (!detectedServerName) return;
    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      if (!inMemoryChatState[detectedServerName]) inMemoryChatState[detectedServerName] = {};

      const oldMessages = inMemoryChatState[detectedServerName][channelName] || [];
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      if (newMergedMessages.length > oldMessages.length) {
        inMemoryChatState[detectedServerName][channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(oldMessages.length);
        for (const msg of newlyAddedHistoricalMessages) {
          addMessageToSyntheticChannelIfNeeded(
            inMemoryChatState[detectedServerName],
            msg,
            channelName,
          );
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
    if (isInitializingChat || isSwitchingTabs || !detectedServerName) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!currentActiveChannel) return;

    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      if (!inMemoryChatState[detectedServerName]) {
        inMemoryChatState[detectedServerName] = {};
      }
      if (!inMemoryChatState[detectedServerName][currentActiveChannel]) {
        inMemoryChatState[detectedServerName][currentActiveChannel] = [];
      }
      inMemoryChatState[detectedServerName][currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(
        inMemoryChatState[detectedServerName],
        messageData,
        currentActiveChannel,
      );

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

        // --- 数据迁移检查 ---
        const v5Data = storage.getMessages();
        if (v5Data && Object.keys(v5Data).length > 0) {
          if (
            confirm(
              `【数据升级】检测到您的旧版本聊天存档。是否将其迁移到当前服务器 [${server}]？\n注意：如果不是该服务器，则选择取消，再选择目标服务器。`,
            )
          ) {
            const migrated = migrateV5toV6(v5Data, server);
            // 原子性地更新内存状态对象的内容
            for (const key of Object.keys(inMemoryChatState)) delete inMemoryChatState[key];
            Object.assign(inMemoryChatState, migrated);
            uiControls.updateUI();
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
