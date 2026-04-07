import './ui/style.css';
import { scanAllDuplicatesAsync } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
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
import { debounce, getISOTimestamp } from './utils.js';

(async () => {
  // --- 全局状态 ---
  let messageObserver = null;
  let tabObserver = null;
  let serverObserver = null;
  let currentActiveChannel = null;
  let detectedServerName = null;
  let isInitializingChat = false;
  let isSwitchingTabs = false;
  // UI 控制句柄
  let uiControls = null;

  // 用于保证实时消息绝对单调递增的全局时钟状态
  let lastRealtimeTimestamp = 0;

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
  let isScanningHistory = false;
  let pendingScan = false;

  async function performScanAndMerge() {
    if (!detectedServerName) return;
    const historicalState = await extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;

      // 通过数据库获取当前频道的最末尾消息片段，用于比较查重和断层
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
            // 清除原有生成的 ID，使新插入的合成记录能够被分配新 ID 以确保唯一性
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
    if (dataChanged && uiControls && !uiControls.isUIPaused()) {
      uiControls.updateUI();
    }
  }

  async function scanAndMergeHistory() {
    if (isScanningHistory) {
      pendingScan = true;
      return;
    }
    isScanningHistory = true;
    try {
      do {
        pendingScan = false;
        await performScanAndMerge();
      } while (pendingScan);
    } finally {
      isScanningHistory = false;
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

    // --- 强制毫秒级时钟推进 (Monotonic Time Stepper) ---
    // 确保即使在同一毫秒内到达的多条消息，也能获得绝对递增的时间戳
    let currentMs = Date.now();
    if (currentMs <= lastRealtimeTimestamp) {
      currentMs = lastRealtimeTimestamp + 1;
    }
    lastRealtimeTimestamp = currentMs;
    const preciseTime = new Date(currentMs).toISOString();

    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      messageData.server = detectedServerName;
      messageData.channel = currentActiveChannel;

      // --- 实时防重检查 ---
      // 获取最近的 10 条记录进行比对，防止误抓延迟渲染的旧消息
      const recentMessages = await storageManager.getLatestMessages(
        messageData.server,
        messageData.channel,
        10,
      );

      const isDuplicate = recentMessages.some(
        (m) => m.sender === messageData.sender && m.content === messageData.content,
      );

      if (isDuplicate) {
        // console.log('[Archiver] 实时监听拦截到重复消息，已忽略:', messageData.content);
        return;
      }

      await storageManager.putMessage(messageData);

      const synthChannel = getSyntheticChannelName(messageData, currentActiveChannel);
      if (synthChannel) {
        const synthMsg = { ...messageData, channel: synthChannel };
        synthMsg.id = undefined;
        await storageManager.putMessage(synthMsg);
      }

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

    // 动态获取防抖配置，允许用户在弱性能设备（如手机）上延长该值
    const initDebounceMs = uiControls ? uiControls.getInitDebounceMs() : 150;

    const handleTabChange = () => {
      const newActiveTab = findActiveTabByClass(tabsContainer.innerHTML);
      if (newActiveTab && newActiveTab !== currentActiveChannel) {
        currentActiveChannel = newActiveTab;
        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
        }
        isSwitchingTabs = true;
        setTimeout(async () => {
          await scanAndMergeHistory();
          isSwitchingTabs = false;
        }, 250);
      }
    };

    currentActiveChannel = findActiveTabByClass(tabsContainer.innerHTML);
    // 核心修复：在激活瞬间，如果 UI 已就绪，立即推送最新的频道名
    if (uiControls) {
      uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
    }
    tabObserver = new MutationObserver(handleTabChange);
    tabObserver.observe(tabsContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    let initNodesCount = 0;
    const MAX_HISTORY_NODES = 110; // 历史记录渲染数量的安全阈值

    const finalizeInitialization = debounce(async () => {
      // 关键：在开始异步扫描前就解锁实时监听。
      // 通道 B 现在有了实时查重，它会自动处理与扫描快照重叠的消息。
      // 这彻底消除了之前在 await 期间的消息丢失盲区。
      isInitializingChat = false;
      await scanAndMergeHistory();
    }, initDebounceMs);

    messageObserver = new MutationObserver((mutationsList) => {
      let hasNewNodes = false;
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          if (isInitializingChat) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE && node.matches('.chat-line')) {
                initNodesCount++;
              }
            }
          } else {
            mutation.addedNodes.forEach(handleNewChatMessage);
          }
        }
      }
      if (isInitializingChat && hasNewNodes) {
        // 容量断路器：如果已经收到接近历史记录上限数量的消息，
        // 说明其实际渲染已饱和，此时我们不再调用防抖函数重置定时器，
        // 防止长防抖设置（如 1500ms）在遇到活跃频道时导致长时间锁死在初始化状态。
        if (initNodesCount < MAX_HISTORY_NODES) {
          finalizeInitialization();
        }
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
  async function main() {
    // 1. 初始化存储层 (并自动触发 V6->V7 迁移)
    // 开启 useIndexedDB = true
    await storageManager.init(true);

    // --- 立即恢复上下文与启动服务器监听 (最高优先级) ---
    let lastPersistedServer = await storageManager.getLastServer();
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
          uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
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
      getMessages: async (server, channel, page, pageSize) => {
        return await storageManager.getMessages(server, channel, page, pageSize);
      },
      getMessagesChunk: async (server, channel, lastTime, limit) => {
        return await storageManager.getMessagesChunk(server, channel, lastTime, limit);
      },
      getAllData: async () => await storageManager.loadAllV6(), // 用于导出功能
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state), // 仍提供给批量导入等特殊维护操作使用
      mergeMessagesToStorage: async (state) => await storageManager.mergeAllV6(state),
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
      replaceState: async (newState) => {
        // UI 会被通知刷新以自动请求新数据
      },
    });

    await uiControls.checkStorageUsage();

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
  }

  if (document.readyState === 'complete') {
    await main();
  } else {
    window.addEventListener('load', async () => await main());
  }
})();
