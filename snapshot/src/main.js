import './ui/style.css';
import { scanAllDuplicatesAsync } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
import { EngineStates, engineMachine } from './machine.js';
import { MigrationManager } from './migrations.js';
import {
  extractServerFromDOM,
  extractUsefulData,
  findActiveTabByClass,
  locateChatElements,
} from './parser.js';
import { getSyntheticChannelName, mergeAndDeduplicateMessages } from './state.js';
import { storageManager } from './storage/index.js';
import { createUI } from './ui/index.js';
import { generateULID } from './utils.js';
import { ChatMonitor } from './monitor.js';
import { debounce, getISOTimestamp } from './utils.js';

(async () => {
  // --- 全局状态 ---
  let serverObserver = null;
  let detectedServerName = null;
  let uiControls = null;
  let chatMonitor = null;

  /*
   * =================================================================
   * 核心功能模块 (业务编排)
   * =================================================================
   */

  /**
   * 扫描当前聊天框中的可见消息，并将其与数据库智能合并。
   */
  async function performScanAndMerge() {
    if (!detectedServerName || !chatMonitor) return;
    const historicalState = await chatMonitor.getHistory();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;

      const oldMessages = await storageManager.getLatestMessages(
        detectedServerName,
        channelName,
        200,
      );
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      if (newMergedMessages.length > oldMessages.length) {
        const newlyAdded = newMergedMessages.slice(oldMessages.length);
        for (const msg of newlyAdded) {
          msg.server = detectedServerName;
          msg.channel = channelName;
        }
        await storageManager.putMessages(newlyAdded);

        const synthMessages = [];
        for (const msg of newlyAdded) {
          const synthChannel = getSyntheticChannelName(msg, channelName);
          if (synthChannel) {
            const synthMsg = { ...msg, channel: synthChannel };
            synthMsg.id = undefined;
            synthMessages.push(synthMsg);
          }
        }
        if (synthMessages.length > 0) {
          await storageManager.putMessages(synthMessages);
        }
        dataChanged = true;
      }
    }
    if (dataChanged && uiControls) {
      uiControls.invalidateCache();
      if (!uiControls.isUIPaused()) {
        uiControls.updateUI();
      }
    }
  }

  async function scanAndMergeHistory() {
    if (!engineMachine.tryAcquireScanLock()) return;
    try {
      do {
        engineMachine.clearScanPending();
        await performScanAndMerge();
      } while (engineMachine.hasPendingScan());
    } finally {
      engineMachine.releaseScanLock();
    }
  }

  /**
   * 处理从监控器传来的实时消息。
   */
  async function handleMonitorMessage(messageData) {
    if (!detectedServerName) return;

    messageData.server = detectedServerName;

    // --- 实时防重检查 ---
    const recentMessages = await storageManager.getLatestMessages(
      messageData.server,
      messageData.channel,
      10,
    );

    const isDuplicate = recentMessages.some(
      (m) => m.sender === messageData.sender && m.content === messageData.content,
    );

    if (isDuplicate) return;

    await storageManager.putMessage(messageData);
    if (uiControls) uiControls.onNewMessage(messageData);

    const synthChannel = getSyntheticChannelName(messageData, messageData.channel);
    if (synthChannel) {
      const synthMsg = { ...messageData, channel: synthChannel };
      synthMsg.id = undefined;
      await storageManager.putMessage(synthMsg);
      if (uiControls) uiControls.onNewMessage(synthMsg);
    }

    if (uiControls && !uiControls.isUIPaused()) {
      uiControls.updateUI();
    }
  }

  /**
   * 激活/停用 聊天记录器。
   */
  function activateLogger() {
    if (!chatMonitor) return;
    chatMonitor.start(scanAndMergeHistory);
  }

  function deactivateLogger() {
    engineMachine.reset();
    if (chatMonitor) chatMonitor.stop();
  }

  /** 脚本主入口函数。*/
  async function main() {
    // 1. 初始化存储层 (并自动触发 V6->V7 迁移)
    // 开启 useIndexedDB = true
    await storageManager.init(true);

    // --- 立即恢复上下文与启动服务器监听 (最高优先级) ---
    const lastPersistedServer = await storageManager.getLastServer();
    detectedServerName = lastPersistedServer; // 初始设为持久化值作为回退
    let currentDOMServer = null; // 专门用于 DOM 轮询去重

    const updateServer = async () => {
      const server = extractServerFromDOM();
      // 核心修复：即使 server 等于 detectedServerName (持久化值)，
      // 只要它不同于 currentDOMServer (本次生命周期未处理过)，就应当触发更新。
      if (server && server !== currentDOMServer) {
        currentDOMServer = server;
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        await storageManager.setLastServer(server); // 持久化缓存

        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, chatMonitor ? chatMonitor.currentActiveChannel : null);
        }

        // 检查并触发交互式迁移 (如 v5 -> v6)
        const currentState = await storageManager.loadAllV6();
        await MigrationManager.checkAndTriggerInteractiveMigrations(
          storageManager,
          server,
          currentState,
          (newState) => {
            if (uiControls.setState) uiControls.setState(newState);
          },
        );
      }
    };

    serverObserver = new MutationObserver(updateServer);
    serverObserver.observe(document.body, { childList: true, subtree: true });
    await updateServer(); // 立即同步执行一次

    // 2. 初始化 UI 与数据适配器
    const dataAdapter = {
      getServers: async () => await storageManager.getServers(),
      getChannels: async (server) => await storageManager.getChannels(server),
      getChannelCount: async (server, channel) =>
        await storageManager.getChannelCount(server, channel),
      getMessages: async (server, channel, page, pageSize, onProgress, offsetOverride) => {
        return await storageManager.getMessages(
          server,
          channel,
          page,
          pageSize,
          onProgress,
          offsetOverride,
        );
      },
      getMessagesChunk: async (server, channel, lastTime, limit) => {
        return await storageManager.getMessagesChunk(server, channel, lastTime, limit);
      },
      getAllData: async () => await storageManager.loadAllV6(), // 用于导出功能
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state),
      mergeMessagesToStorage: async (state) => await storageManager.mergeAllV6(state),
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
      manualSave: async () => {},
      replaceState: async (newState) => {},
    });

    // 2.5 初始化监控器
    chatMonitor = new ChatMonitor({
      onMessage: handleMonitorMessage,
      onTabChange: (channel) => {
        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, channel);
        }
      },
      getSelfName: () => storageManager.getSelfName(),
      getInitDebounceMs: () => uiControls.getInitDebounceMs(),
    });

    // 将初始检测到的服务器状态同步给 UI
    if (detectedServerName) {
      uiControls.updateRecordingStatus(detectedServerName, chatMonitor.currentActiveChannel);
    }

    await uiControls.checkStorageUsage();

    const uiObserver = new MutationObserver(() => {
      const { chatLogContainer } = locateChatElements();
      const isMonitorRunning = engineMachine.state !== EngineStates.STOPPED;

      if (chatLogContainer) {
        const isVisible = chatLogContainer.style.display !== 'none';
        if (isVisible && !isMonitorRunning) {
          activateLogger();
        } else if (!isVisible && isMonitorRunning) {
          deactivateLogger();
        }
      } else if (isMonitorRunning) {
        deactivateLogger();
      }
    });
    uiObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  if (document.readyState === 'complete') {
    await main();
  } else {
    window.addEventListener('load', async () => await main());
  }
})();
