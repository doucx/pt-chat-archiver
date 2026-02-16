import './ui/style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
import { MigrationManager } from './migrations.js';
import { generateULID } from './utils.js';
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
    const chatLines = Array.from(elements.chatLog.children);
    const currentDate = new Date();
    let lastTimeParts = null;

    // 1. 倒序遍历：确定每条消息的绝对时间（处理跨天逻辑）
    // 我们将结果存入临时数组，因为我们需要正序来生成单调递增的 ID
    const tempItems = [];

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

      tempItems.unshift({ element, isoTime: isoTimeApproximation });
    }

    // 2. 正序遍历：生成消息并确保批次内 ID 单调递增
    const messages = [];
    let lastCalculatedTimestamp = 0;

    for (const item of tempItems) {
      let timestamp = new Date(item.isoTime).getTime();

      // [核心修复] 批次内单调性保证
      // 如果计算出的时间戳小于等于上一条，说明在一分钟内，强制微调 ID 时间戳
      if (timestamp <= lastCalculatedTimestamp) {
        timestamp = lastCalculatedTimestamp + 1;
      }
      lastCalculatedTimestamp = timestamp;

      // 使用微调后的时间戳生成数据（这将影响生成的 ID）
      const adjustedIsoTime = new Date(timestamp).toISOString();
      const messageData = extractUsefulData(item.element, selfName, adjustedIsoTime);

      if (messageData?.content) {
        messageData.is_historical = true;
        // 注意：messageData.time 现在包含了毫秒级微调。
        // 这对于排序是必要的，且不会影响 UI 显示（格式化函数会忽略毫秒）。
        messages.push(messageData);
      }
    }

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

      // [核心修复] 序列 ID 修复 (Sequence Repair)
      // 解决 "Live(32s)" 与 "History(00s)" 合并后的排序倒错问题。
      // 如果发现后一条消息的 ID 小于前一条，强制重写后一条的 ID。
      let lastId = null;

      for (let i = 0; i < newMergedMessages.length; i++) {
        const msg = newMergedMessages[i];

        if (lastId && msg.id < lastId) {
          // 发现乱序：当前消息逻辑在后，但 ID 却更小
          // 以 LastMsg 的时间戳为基准，+1ms 作为新 ID 的种子
          // 注意：我们无法直接反解 ULID 的时间，但我们可以信任上一条消息的 time 属性作为参考
          // (如果上一条消息也是修复过的，它的 time 可能还没变，但 ID 变了。
          // 这里为了简单稳健，我们取 "上一条消息的时间戳" 和 "当前消息时间戳" 的最大值 + 1)

          const prevMsg = newMergedMessages[i - 1];
          const prevTime = new Date(prevMsg.time).getTime();
          const currTime = new Date(msg.time).getTime();

          // 确保新时间戳严格大于上一条的时间
          const newSeedTime = Math.max(prevTime, currTime) + 1;

          // 生成新 ID
          const newId = generateULID(newSeedTime);

          // 更新消息
          // 关键：我们只更新 ID 和 time (保持数据一致性)，不改变内容
          msg.id = newId;
          msg.time = new Date(newSeedTime).toISOString(); // 同步更新 time 以防后续逻辑困惑

          // console.log(`[Archiver] Fixed ordering for msg: ${msg.content.slice(0, 10)}...`);
        }
        lastId = msg.id;
      }

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
      replaceState: (newState) => {
        inMemoryChatState = newState;
      },
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
