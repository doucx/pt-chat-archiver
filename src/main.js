import './ui/style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
import { MigrationManager } from './migrations.js';
import {
  extractServerFromDOM,
  extractUsefulData,
  findActiveTabByClass,
  locateChatElements,
} from './parser.js';
import { addMessageToSyntheticChannelIfNeeded, mergeAndDeduplicateMessages } from './state.js';
import { storageManager } from './storage/index.js';
import { createUI } from './ui/index.js';
import { debounce, getISOTimestamp } from './utils.js';

(async () => {
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
  let autoSaveTimer = null;

  /*
   * =================================================================
   * 核心功能模块
   * =================================================================
   */

  /** 扫描聊天框中已存在的消息，时间戳根据UI显示的 `HH:MM` 进行估算。*/
  async function extractHistoricalChatState() {
    const elements = locateChatElements();
    if (!elements.tabs || !elements.chatLog) return { current_tab: null, messages: [] };

    const current_tab = findActiveTabByClass(elements.tabs.innerHTML);
    const selfName = (await storageManager.getSelfName()) || '';
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
  async function scanAndMergeHistory() {
    if (!detectedServerName) return;
    const historicalState = await extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      if (!inMemoryChatState[detectedServerName]) inMemoryChatState[detectedServerName] = {};
      const serverData = inMemoryChatState[detectedServerName];

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
  async function handleNewChatMessage(node) {
    if (isInitializingChat || isSwitchingTabs || !detectedServerName) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!currentActiveChannel) return;

    const selfName = (await storageManager.getSelfName()) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      if (!inMemoryChatState[detectedServerName]) inMemoryChatState[detectedServerName] = {};
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
        setTimeout(async () => {
          await scanAndMergeHistory();
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

    const finalizeInitialization = debounce(async () => {
      await scanAndMergeHistory();
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

  /** 执行一次完整的保存动作并更新 UI。*/
  async function performAutoSave() {
    console.info('Saving archive to local storage (V6)...');
    await storageManager.saveAllV6(inMemoryChatState);
    if (uiControls) {
      uiControls.setLastSavedTime(getISOTimestamp());
      await uiControls.checkStorageUsage();
    }
  }

  /** (重新)启动自动保存定时器。*/
  function startAutoSaveTimer() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    const intervalSeconds = uiControls ? uiControls.getAutoSaveInterval() : 30;
    console.log(`[Archiver] Auto-save timer started, interval: ${intervalSeconds}s`);
    autoSaveTimer = setInterval(performAutoSave, intervalSeconds * 1000);
  }

  /** 脚本主入口函数。*/
  async function main() {
    // 1. 初始化存储层 (并自动触发 V6->V7 迁移)
    // 开启 useIndexedDB = true
    await storageManager.init(true);

    // 2. 加载状态与初始化 UI
    inMemoryChatState = await storageManager.loadAllV6();
    uiControls = await createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage: (state) => storageManager.saveAllV6(state), // Pass a compatible function
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
      manualSave: performAutoSave,
      onAutoSaveIntervalChange: startAutoSaveTimer,
    });

    await uiControls.checkStorageUsage();

    // --- 启动服务器检测观察者 ---
    const updateServer = async () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }

        // 3. 检查并触发交互式迁移 (如 v5 -> v6)
        await MigrationManager.checkAndTriggerInteractiveMigrations(
          storageManager,
          server,
          inMemoryChatState,
          (newState) => {
            inMemoryChatState = newState;
            uiControls.setState(inMemoryChatState);
          },
        );
      }
    };

    serverObserver = new MutationObserver(updateServer);
    serverObserver.observe(document.body, { childList: true, subtree: true });
    await updateServer(); // 立即执行一次

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

    startAutoSaveTimer();

    window.addEventListener('pagehide', () => storageManager.saveAllV6(inMemoryChatState));
  }

  if (document.readyState === 'complete') {
    await main();
  } else {
    window.addEventListener('load', async () => await main());
  }
})();
