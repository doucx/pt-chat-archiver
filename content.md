你的重构建议非常及时且具有前瞻性。

`src/main.js` 确实已经成为了项目中的“最后一块巨石”。将 DOM 监听、历史扫描和生命周期管理封装进 `ChatMonitor` 模块，不仅能让 `main.js` 回归其作为“应用入口和编排者”的本质，还能极大地方便我们对监听逻辑进行模拟测试（Mocking），从而解决目前核心监听逻辑覆盖率为 0% 的尴尬局面。

我将生成一个计划，创建 `ChatMonitor` 类并重构 `main.js` 以使用该实例。

## [WIP] refactor: 将 DOM 监听逻辑从 main.js 解耦至 ChatMonitor 类

### 用户需求
需要将 `src/main.js` 中复杂的 `MutationObserver` 逻辑、历史记录抓取逻辑以及相关的生命周期状态切换解耦出来，封装进一个独立的 `ChatMonitor` 类中。

### 评论
这是迈向“可测试架构”的关键一步。通过将 DOM 副作用封装在 `ChatMonitor` 中，我们可以更清晰地定义“什么时候开始监听”、“监听到什么”以及“如何处理数据流入”。这符合单一职责原则（SRP），并能显著降低 `main.js` 的认知负担。

### 目标
1.  新建 `src/monitor.js` 文件，实现 `ChatMonitor` 类。
2.  将 `extractHistoricalChatState` 迁移至 `ChatMonitor.getHistory()`。
3.  将 `messageObserver` 和 `tabObserver` 封装在 `ChatMonitor` 内部，并通过事件回调（Callbacks）对外通信。
4.  在 `main.js` 中移除冗余逻辑，通过初始化 `ChatMonitor` 实例来驱动核心录制流程。

### 基本原理
我们将 `ChatMonitor` 设计为一个事件驱动的控制器。它负责与浏览器 DOM 交互（低层逻辑），当检测到新消息或频道切换时，它不直接操作数据库，而是调用 `main.js` 传入的回调函数。这样，`main.js` 只需要关注业务规则（如：数据流向哪个服务器、是否需要合成频道等），而不再关心 `MutationObserver` 的具体配置。

### 标签
#intent/refine #flow/ready #priority/high 
#comp/engine #concept/executor #scope/core 
#ai/delegate
#task/domain/refactoring
#task/object/main-logic
#task/action/decoupling
#task/state/begin

---

### Script

#### Acts 1: 创建 `src/monitor.js` 模块

我们将所有的 DOM 监听、节点定位和历史抓取逻辑移动到这个新类中。

~~~~~act
write_file
src/monitor.js
~~~~~
~~~~~javascript
import { EngineStates, engineMachine } from './machine.js';
import {
  findActiveTabByClass,
  locateChatElements,
  extractUsefulData,
} from './parser.js';
import { debounce } from './utils.js';

/**
 * ChatMonitor 负责直接与游戏 DOM 交互。
 * 它封装了 MutationObserver，并提供抓取历史记录和实时监听的能力。
 */
export class ChatMonitor {
  constructor(options = {}) {
    this.onMessage = options.onMessage || (() => {});
    this.onTabChange = options.onTabChange || (() => {});
    this.getSelfName = options.getSelfName || (async () => '');
    this.getInitDebounceMs = options.getInitDebounceMs || (() => 150);

    this.messageObserver = null;
    this.tabObserver = null;
    this.currentActiveChannel = null;
    this.tabSwitchTimeout = null;
    this.lastRealtimeTimestamp = 0;
  }

  /**
   * 扫描聊天框中已存在的消息。
   */
  async getHistory() {
    const elements = locateChatElements();
    if (!elements.tabs || !elements.chatLog) return { current_tab: null, messages: [] };

    const current_tab = findActiveTabByClass(elements.tabs.innerHTML);
    const selfName = await this.getSelfName();
    const chatLines = Array.from(elements.chatLog.children);
    const currentDate = new Date();
    let lastTimeParts = null;

    const tempItems = [];

    // 1. 倒序遍历确定绝对时间
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

    // 2. 正序生成消息数据
    const messages = [];
    let lastCalculatedTimestamp = 0;

    for (const item of tempItems) {
      let timestamp = new Date(item.isoTime).getTime();
      if (timestamp <= lastCalculatedTimestamp) {
        timestamp = lastCalculatedTimestamp + 1;
      }
      lastCalculatedTimestamp = timestamp;

      const adjustedIsoTime = new Date(timestamp).toISOString();
      const messageData = extractUsefulData(item.element, selfName, adjustedIsoTime);

      if (messageData?.content) {
        messageData.is_historical = true;
        messages.push(messageData);
      }
    }

    return { current_tab, messages };
  }

  /**
   * 启动实时监听。
   */
  start(onStarted) {
    const { chatLog, tabs: tabsContainer } = locateChatElements();
    if (!chatLog || !tabsContainer || this.messageObserver) return;

    engineMachine.transition(EngineStates.STARTING);

    const handleTabChange = () => {
      const newActiveTab = findActiveTabByClass(tabsContainer.innerHTML);
      if (newActiveTab && newActiveTab !== this.currentActiveChannel) {
        this.currentActiveChannel = newActiveTab;
        this.onTabChange(newActiveTab);

        engineMachine.transition(EngineStates.TAB_SWITCHING);
        clearTimeout(this.tabSwitchTimeout);

        this.tabSwitchTimeout = setTimeout(async () => {
          if (engineMachine.state === EngineStates.TAB_SWITCHING) {
            engineMachine.transition(EngineStates.RECORDING);
            if (onStarted) await onStarted();
          }
        }, 250);
      }
    };

    this.currentActiveChannel = findActiveTabByClass(tabsContainer.innerHTML);
    this.onTabChange(this.currentActiveChannel);

    this.tabObserver = new MutationObserver(handleTabChange);
    this.tabObserver.observe(tabsContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    let initNodesCount = 0;
    const MAX_HISTORY_NODES = 110;

    const finalizeInitialization = debounce(async () => {
      if (engineMachine.isStarting()) {
        engineMachine.transition(EngineStates.RECORDING);
        if (onStarted) await onStarted();
      }
    }, this.getInitDebounceMs());

    this.messageObserver = new MutationObserver((mutationsList) => {
      let hasNewNodes = false;
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          if (engineMachine.isStarting()) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE && node.matches('.chat-line')) {
                initNodesCount++;
              }
            }
          } else {
            mutation.addedNodes.forEach(node => this._handleLiveNode(node));
          }
        }
      }
      if (engineMachine.isStarting() && hasNewNodes) {
        if (initNodesCount < MAX_HISTORY_NODES) {
          finalizeInitialization();
        }
      }
    });

    this.messageObserver.observe(chatLog, { childList: true });
    finalizeInitialization();
  }

  /**
   * 停止监听。
   */
  stop() {
    clearTimeout(this.tabSwitchTimeout);
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }
    if (this.tabObserver) {
      this.tabObserver.disconnect();
      this.tabObserver = null;
    }
    this.currentActiveChannel = null;
  }

  async _handleLiveNode(node) {
    if (!engineMachine.canProcessLiveMessage()) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!this.currentActiveChannel) return;

    const selfName = await this.getSelfName();

    let currentMs = Date.now();
    if (currentMs <= this.lastRealtimeTimestamp) {
      currentMs = this.lastRealtimeTimestamp + 1;
    }
    this.lastRealtimeTimestamp = currentMs;
    const preciseTime = new Date(currentMs).toISOString();

    const messageData = extractUsefulData(node, selfName, preciseTime);
    if (messageData?.content) {
      messageData.channel = this.currentActiveChannel;
      this.onMessage(messageData);
    }
  }
}
~~~~~

#### Acts 2: 重构 `src/main.js` 以使用 `ChatMonitor`

我们将移除 `main.js` 中所有关于 `MutationObserver` 的细节，通过实例化 `ChatMonitor` 来重构录制逻辑。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  // --- 全局状态 ---
  let messageObserver = null;
  let tabObserver = null;
  let serverObserver = null;
  let currentActiveChannel = null;
  let detectedServerName = null;
  // UI 控制句柄
  let uiControls = null;

  // 用于保证实时消息绝对单调递增的全局时钟状态
  let lastRealtimeTimestamp = 0;
  let tabSwitchTimeout = null;

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

  /*
   * =================================================================
   * 脚本主程序与生命周期管理
   * =================================================================
   */

  /** 处理 MutationObserver 捕获到的新消息节点。*/
  async function handleNewChatMessage(node) {
    if (!engineMachine.canProcessLiveMessage() || !detectedServerName) return;
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

      if (uiControls) {
        uiControls.onNewMessage(messageData);
      }

      const synthChannel = getSyntheticChannelName(messageData, currentActiveChannel);
      if (synthChannel) {
        const synthMsg = { ...messageData, channel: synthChannel };
        synthMsg.id = undefined;
        await storageManager.putMessage(synthMsg);
        if (uiControls) {
          uiControls.onNewMessage(synthMsg);
        }
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

    engineMachine.transition(EngineStates.STARTING);

    // 动态获取防抖配置，允许用户在弱性能设备（如手机）上延长该值
    const initDebounceMs = uiControls ? uiControls.getInitDebounceMs() : 150;

    const handleTabChange = () => {
      const newActiveTab = findActiveTabByClass(tabsContainer.innerHTML);
      if (newActiveTab && newActiveTab !== currentActiveChannel) {
        currentActiveChannel = newActiveTab;
        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
        }

        engineMachine.transition(EngineStates.TAB_SWITCHING);
        clearTimeout(tabSwitchTimeout);

        tabSwitchTimeout = setTimeout(async () => {
          // 确保只有在仍然处于切换状态时才恢复录制（防止由于频繁切换导致的竞态条件）
          if (engineMachine.state === EngineStates.TAB_SWITCHING) {
            engineMachine.transition(EngineStates.RECORDING);
            await scanAndMergeHistory();
          }
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
      if (engineMachine.isStarting()) {
        engineMachine.transition(EngineStates.RECORDING);
        await scanAndMergeHistory();
      }
    }, initDebounceMs);

    messageObserver = new MutationObserver((mutationsList) => {
      let hasNewNodes = false;
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          if (engineMachine.isStarting()) {
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
      if (engineMachine.isStarting() && hasNewNodes) {
        // 容量断路器：如果已经收到接近历史记录上限数量的消息，说明其实际渲染已饱和
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
    engineMachine.reset();
    clearTimeout(tabSwitchTimeout);

    if (messageObserver) {
      messageObserver.disconnect();
      messageObserver = null;
    }
    if (tabObserver) {
      tabObserver.disconnect();
      tabObserver = null;
    }
    currentActiveChannel = null;
  }
~~~~~
~~~~~javascript.new
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
~~~~~

#### Acts 3: 在 `main()` 函数中初始化 `ChatMonitor`

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
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

    // 将初始检测到的服务器状态同步给 UI，修复初始加载时状态未更新的 Bug
    if (detectedServerName) {
      uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
    }
~~~~~
~~~~~javascript.new
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
~~~~~

#### Acts 4: 修改监听逻辑，确保监控器状态与 `chat-log` 容器同步

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
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
~~~~~

### 下一步建议
我们已经成功将核心监控逻辑从 `main.js` 中抽离出来。现在的 `main.js` 变得极其清爽，只负责初始化和胶水层逻辑。

接下来的建议：
1.  **完善测试**：现在我们可以为 `ChatMonitor` 编写专门的单元测试了。我们可以通过模拟 DOM 环境（JSDOM）并注入自定义的 `MutationObserver` 行为，来验证它是如何在各种边界情况下工作的。
2.  **错误边界**：在 `ChatMonitor` 中添加更多的错误处理逻辑。例如，如果 `tabsContainer` 意外消失，应该如何优雅地重置状态。
3.  **状态清理**：审查 `machine.js` 是否需要更多的状态来反映 `ChatMonitor` 的细粒度状态（如正在初始化历史记录、正在切换等）。
