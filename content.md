## [WIP] fix: 修复同毫秒并发导致的消息乱序与重复加载漏洞

### 错误分析

1. **同毫秒时间戳冲突**: 实时监听器 (`handleNewChatMessage`) 使用 `getISOTimestamp()` (即 `Date.now()`) 为新消息分配时间戳。当多条消息在同一毫秒内渲染时，它们会获得相同的时间前缀。
2. **随机后缀导致的排序混乱**: ULID 在时间前缀相同时，排序取决于后半段的随机字符。这使得同毫秒消息在 IndexedDB 中的物理存储顺序变得随机，破坏了原有的 DOM 顺序。
3. **对齐算法失效**: 数据库中的乱序序列与 DOM 中的真实序列无法在 `mergeAndDeduplicateMessages` 中正确对齐，导致算法误判这些消息为新数据并重复追加。

### 用户需求

确保无论消息到达得多快，数据库的存储顺序都必须严格遵循消息在屏幕上（DOM 中）出现的先后顺序，防止因此产生的查重失效与重复追加。

### 评论

这是一个极其底层的并发排序修复。通过在实时通道引入时钟推进机制（Time Stepper），我们保证了系统中的每一个 ULID 在生成的那一刻起，就具备绝对的、物理层面的时序单调性，一劳永逸地解决了乱序问题。

### 目标

1. 在 `main.js` 中引入一个全局变量 `lastRealtimeTimestamp`，用于追踪最后一次分配的毫秒时间戳。
2. 在 `handleNewChatMessage` 中，若当前 `Date.now()` 小于等于 `lastRealtimeTimestamp`，则强制分配 `lastRealtimeTimestamp + 1`，并将修正后的时间传递给解析器。

### 基本原理

通过强制干预极高频并发下的时间戳分配，我们剥夺了 ULID 随机后缀的排序决定权，使其完全退化为防碰撞的哈希值。排序权将 100% 回归到时间戳前缀，从而精确锁定 DOM 顺序。

### 标签

#intent/fix #flow/ready #priority/critical #comp/engine #concept/state #scope/core #ai/delegate #task/domain/sync #task/object/ulid-generator #task/action/fix #task/state/end

---

### Script

#### Acts 1: 为实时通道引入绝对单调时钟

修改 `main.js`，在顶层作用域声明时间追踪器，并在 `handleNewChatMessage` 中实施时钟推进。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript
  let currentActiveChannel = null;
  let detectedServerName = null;
  let isInitializingChat = false;
  let isSwitchingTabs = false;
  // UI 控制句柄
  let uiControls = null;
  const autoSaveTimer = null;

  /*
~~~~~
~~~~~javascript
  let currentActiveChannel = null;
  let detectedServerName = null;
  let isInitializingChat = false;
  let isSwitchingTabs = false;
  // UI 控制句柄
  let uiControls = null;
  const autoSaveTimer = null;
  
  // 用于保证实时消息绝对单调递增的全局时钟状态
  let lastRealtimeTimestamp = 0;

  /*
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript
  /** 处理 MutationObserver 捕获到的新消息节点。*/
  async function handleNewChatMessage(node) {
    if (isInitializingChat || isSwitchingTabs || !detectedServerName) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!currentActiveChannel) return;

    const selfName = (await storageManager.getSelfName()) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
~~~~~
~~~~~javascript
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
~~~~~

### 下一步建议

随着这个底层时钟补丁的打入，我们在“重复加载”这一系列问题上，已经完成了从**上层逻辑（接管状态重叠）**到**中层算法（残缺对齐容错）**，再到**底层数据（并发时序乱序）**的全面修复。

现在你可以使用 `清理重复记录` 将历史的错乱清理干净，然后自由地测试它。理论上，无论你的网速多卡，或者你的手指按得多快，消息流都将固若金汤。
