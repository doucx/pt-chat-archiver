import './style.css';
import { STORAGE_KEY_V5, OLD_STORAGE_KEY_V4, SELF_NAME_KEY, STORAGE_WARNING_THRESHOLD_MB } from './constants.js';
import { getStorageUsageInMB, debounce, getISOTimestamp, formatISOTimeForDisplay } from './utils.js';
import { SELF_NAME_KEY, STORAGE_KEY_V5 } from './constants.js';
import { getISOTimestamp } from './utils.js';
import { debounce } from './utils.js';
import { extractUsefulData, locateChatElements, findActiveTabByClass } from './parser.js';
import { migrateDataV4toV5, mergeAndDeduplicateMessages, loadMessagesFromStorage, saveMessagesToStorage, addMessageToSyntheticChannelIfNeeded, cleanChannelRecords, detectTotalDuplicates } from './state.js';
import { createUI } from './ui.js';

(function() {
  'use strict';

  // --- 全局状态 ---
  let inMemoryChatState = {};
  let messageObserver = null;
  let tabObserver = null;
  let currentActiveChannel = null;
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
    let currentDate = new Date();
    let lastTimeParts = null;

    for (let i = chatLines.length - 1; i >= 0; i--) {
      const element = chatLines[i];
      const timeNode = element.querySelector('.chat-line-timestamp');
      if (!timeNode || !timeNode.textContent.includes(':')) continue;

      const timeText = timeNode.textContent.trim();
      const [hours, minutes] = timeText.split(':').map(Number);
      if (lastTimeParts && (hours > lastTimeParts.hours || (hours === lastTimeParts.hours && minutes > lastTimeParts.minutes))) {
        currentDate.setDate(currentDate.getDate() - 1);
      }
      lastTimeParts = { hours, minutes };

      const localDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')} ${timeText}`;
      const isoTimeApproximation = new Date(localDateString.replace(/-/g, '/')).toISOString();

      const messageData = extractUsefulData(element, selfName, isoTimeApproximation);
      if (messageData && messageData.content) {
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
    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      const oldMessages = inMemoryChatState[channelName] || [];
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      if (newMergedMessages.length > oldMessages.length) {
        inMemoryChatState[channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(oldMessages.length);
        newlyAddedHistoricalMessages.forEach(msg => {
          addMessageToSyntheticChannelIfNeeded(inMemoryChatState, msg, channelName);
        });
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
    if (!currentActiveChannel) return;

    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData && messageData.content) {
      if (!inMemoryChatState[currentActiveChannel]) {
        inMemoryChatState[currentActiveChannel] = [];
      }
      inMemoryChatState[currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(inMemoryChatState, messageData, currentActiveChannel);
      
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
    tabObserver.observe(tabsContainer, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

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
