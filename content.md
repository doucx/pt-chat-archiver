这是一个绝佳的系统架构级洞察。

在处理像 DOM MutationObserver 这种高频触发、且充满各种时序竞争（例如初始化时的瞬间大量渲染、极速切换 Tab 等）的场景时，仅仅依靠 `isInitializingChat`、`isSwitchingTabs`、`isScanningHistory` 这一堆分散的“布尔变量汤 (Boolean Flag Soup)”不仅难以测试，而且随着逻辑增加，极易产生竞态漏洞（例如两次极速切换 Tab 可能会打断彼此的 clearTimeout 逻辑导致记录遗漏）。

引入一个中央状态机（Finite State Machine, FSM）来统一接管生命周期和异步并发锁，是重构走向“防御性编程”最标准也是最漂亮的做法。

## [WIP] refactor: 引入 ArchiverMachine 状态机以接管全局生命周期

### 用户需求

将零散于 `main.js` 中的全局状态标志重构为集中的状态机模型，提高代码的可维护性和防错健壮性。

### 评论

这不仅是一个简单的代码清理，这是一个架构升级。分离了“生命周期状态（Lifecycle）”和“异步扫描并发锁（Async Lock）”两个维度，使得我们能彻底根除由于 `setTimeout` 和 `await` 执行顺序不确定带来的潜在边界错误。

### 目标

1. 新建 `src/machine.js`，定义 `EngineStates` 枚举与 `ArchiverMachine` 类。
2. 将 `main.js` 现存的四个布尔标记（`isInitializingChat`、`isSwitchingTabs`、`isScanningHistory`、`pendingScan`）以及控制流，平滑迁移到状态机中。
3. 解决在 `handleTabChange` 中之前存在的因极速多次切换导致 `setTimeout` 覆盖的不完美问题。

### 基本原理

核心状态机切分为 4 个主状态：
- `STOPPED`: 尚未激活监听。
- `STARTING`: 防抖收集 DOM 的初始阶段。
- `TAB_SWITCHING`: 正在切换频道并防抖。
- `RECORDING`: 正常运行并处理增量信息。

对于 `scanAndMergeHistory`，状态机内部提供了一套原子的 `tryAcquireScanLock()` 并发锁方法，避免它与生命周期状态混淆。

### 标签

#intent/refine #flow/ready #priority/high #comp/runtime #concept/state #task/domain/engine #task/object/state-machine #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 创建状态机模块
抽离并正式定义有限状态机和并发锁模型。

~~~~~act
write_file
src/machine.js
~~~~~
~~~~~javascript
/**
 * 引擎的核心状态机定义
 * 用于替代分散在 main.js 中的各种 boolean 标志，
 * 提供一个确定的、可预测的生命周期管理，并处理异步扫描的并发锁。
 */

export const EngineStates = {
  STOPPED: 'STOPPED',             // 引擎停止，尚未激活监听
  STARTING: 'STARTING',           // 进入服务器或初始化阶段，防抖收集 DOM 节点
  TAB_SWITCHING: 'TAB_SWITCHING', // 正在切换频道，等待防抖结算
  RECORDING: 'RECORDING'          // 正常运行，实时监听 DOM 增量更新
};

export class ArchiverMachine {
  constructor() {
    this.state = EngineStates.STOPPED;
    
    // 异步并发锁 (用于 scanAndMergeHistory)
    this.isScanning = false;
    this.scanPending = false;
  }

  transition(newState) {
    if (this.state === newState) return;
    this.state = newState;
  }

  canProcessLiveMessage() {
    // 只有在 RECORDING 状态下才处理 DOM Mutations 的实时增量
    return this.state === EngineStates.RECORDING;
  }

  isStarting() {
    return this.state === EngineStates.STARTING;
  }

  // --- 异步并发锁管理 ---

  tryAcquireScanLock() {
    if (this.isScanning) {
      this.scanPending = true;
      return false;
    }
    this.isScanning = true;
    this.scanPending = false;
    return true;
  }

  clearScanPending() {
    this.scanPending = false;
  }

  hasPendingScan() {
    return this.scanPending;
  }

  releaseScanLock() {
    this.isScanning = false;
  }

  reset() {
    this.state = EngineStates.STOPPED;
    this.isScanning = false;
    this.scanPending = false;
  }
}

// 导出一个单例实例供全局使用
export const engineMachine = new ArchiverMachine();
~~~~~

#### Acts 2: 在入口顶部替换全局变量
引入并挂载新的状态机制。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
import { debounce, getISOTimestamp } from './utils.js';
import { EngineStates, engineMachine } from './machine.js';

(async () => {
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
~~~~~

#### Acts 3: 使用 FSM 锁重构扫描调度
摒弃原先裸露的变量。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  let isScanningHistory = false;
  let pendingScan = false;

  async function performScanAndMerge() {
~~~~~
~~~~~javascript.new
  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  async function performScanAndMerge() {
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
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
~~~~~

#### Acts 4: 对核心运行时代码适配状态机
在 `handleNewChatMessage`、`activateLogger`、`deactivateLogger` 中应用状态机。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  async function handleNewChatMessage(node) {
    if (isInitializingChat || isSwitchingTabs || !detectedServerName) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
~~~~~
~~~~~javascript.new
  async function handleNewChatMessage(node) {
    if (!engineMachine.canProcessLiveMessage() || !detectedServerName) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
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

### 下一步建议

我们已经消灭了主引擎的核心竞态漏洞，代码变得更加模块化了！这会让后续所有的重构或添加新特性变得安心。

您可以再次测试各项基本功能，特别是：
1. 频繁地高速点击不同的频道标签。
2. 观察切换之后的历史补扫以及实时消息监听是否均能按预期工作。
如果无误，该计划已完成，我们可以进行正式提交 (Commit)。
