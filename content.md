界面关闭期间产生的新消息无法在打开时立即显示，核心原因在于**引用的严格相等性导致 UI 刷新被抑制**。当 `ViewCache` 增量更新缓存中的数组时，虽然数组内容变了，但数组对象的引用（Memory Address）没有变。Preact Signals 在赋值时检测到引用未变，便认为状态没有更新，从而跳过了昂贵的 DOM 渲染过程。

此外，目前的 `updateUI` 在界面不可见时仍然执行完整的刷新逻辑，造成了不必要的后台开销。

## [WIP] fix: 修复界面重新打开后新消息不显示的反应性失效问题

### 错误分析

1.  **引用相等性阻塞**: 在 `refreshView` 中，`currentMessages.value` 直接接收来自 `ViewCache` 的数组引用。由于实时消息是通过 `Array.prototype.push` 添加到这些缓存页数组中的，引用始终保持不变。Preact 的响应式系统执行严格相等检查，导致 UI 无法感知到内容的增量变化。
2.  **后台刷新负载**: 引擎在界面关闭（`display: none`）时仍然通过 `updateUI` 调用 `refreshView`。这涉及到了大量的异步状态检查和 I/O，但在用户看不见时这些工作是冗余的。
3.  **状态同步延迟**: 界面打开时的触发逻辑分散在 DOM 事件中，而非受统一的状态机驱动。

### 用户需求
1.  界面关闭期间产生的新消息，在界面再次打开时应能即时显示。
2.  优化性能，确保界面不可见时不对 UI 信号进行重采样。

### 评论
这是一个关于“响应式陷阱”的典型修复。在处理大量数据的列表（如聊天记录）时，我们通常会为了性能而牺牲一些纯度（直接操作数组），但这需要我们在赋值给信号时显式地打破引用。引入 `isUIVisible` 信号是实现“按需渲染”的最佳实践。

### 目标
1.  在 `uiStore` 中引入 `isUIVisible` 信号。
2.  在 `index.jsx` 中将界面可见性切换逻辑改为状态驱动。
3.  在 `refreshView` 中使用扩展运算符强制创建新引用。
4.  优化 `updateUI` 以在后台静默运行。

### 基本原理
1.  **引用打破 (Reference Breaking)**: 在赋值 `currentMessages.value = [...messages]` 时，创建了一个包含相同内容的全新数组。这会强制触发所有订阅该信号的组件（如 `LogViewer`）重新计算 `useMemo`。
2.  **状态驱动可见性**: 将控制 `container.style.display` 的逻辑移入 Preact 的 `effect` 中，并由 `isUIVisible` 信号驱动。
3.  **懒刷新 (Lazy Refresh)**: 通过在主 `effect` 中订阅 `isUIVisible`，确保界面从隐藏变为显示的一瞬间，能够根据最新的底层缓存数据重新同步一次视图。

### 标签
#intent/fix #flow/ready #priority/high #comp/ui #concept/state #scope/ux #ai/brainstorm #task/domain/ui #task/object/reactivity #task/action/fix #task/state/begin

---

### Script

#### Acts 1: 引入可见性信号

在 `uiStore.js` 中添加用于追踪界面显示状态的 `isUIVisible` 信号。

~~~~~act
patch_file
src/ui/store/uiStore.js
~~~~~
~~~~~javascript.old
export const selfName = signal('');
export const loadingMessage = signal('');

// --- 派生状态 (Computed) ---
~~~~~
~~~~~javascript.new
export const selfName = signal('');
export const loadingMessage = signal('');
export const isUIVisible = signal(false);

// --- 派生状态 (Computed) ---
~~~~~

#### Acts 2: 完善界面响应式控制逻辑

在 `index.jsx` 中进行多项重构：
1. 更新 `refreshView` 以打破数组引用。
2. 将 `toggleButton` 的点击逻辑改为修改信号。
3. 增加对可见性的 `effect` 监听以同步 DOM 样式。
4. 优化 `updateUI` 和主同步 `effect` 的性能。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
  // The core reactive cycle bridging the dataAdapter and Preact Signals
  const refreshView = async () => {
    const renderId = ++currentRenderId;

    // Capture state snapshots
~~~~~
~~~~~javascript.new
  // The core reactive cycle bridging the dataAdapter and Preact Signals
  const refreshView = async () => {
    if (!isUIVisible.value) return;
    const renderId = ++currentRenderId;

    // Capture state snapshots
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
      serverListSig.value = serverList;
      channelListSig.value = channelList;
      channelCountsSig.value = channelCounts;
      currentMessages.value = messages;
      totalCountSig.value = totalCount;
    });
~~~~~
~~~~~javascript.new
      serverListSig.value = serverList;
      channelListSig.value = channelList;
      channelCountsSig.value = channelCounts;
      currentMessages.value = [...messages]; // 强制创建新引用以触发布局重绘
      totalCountSig.value = totalCount;
    });
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
  // Setup DOM Interactions for toggle
  toggleButton.addEventListener('click', () => {
    const isVisible = container.style.display === 'flex';
    if (!isVisible) refreshView();
    container.style.display = isVisible ? 'none' : 'flex';
  });

  // Action Handlers
~~~~~
~~~~~javascript.new
  // Setup DOM Interactions for toggle
  toggleButton.addEventListener('click', () => {
    isUIVisible.value = !isUIVisible.value;
  });

  effect(() => {
    container.style.display = isUIVisible.value ? 'flex' : 'none';
  });

  // Action Handlers
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
  const ioManager = createIOManager({ dataAdapter, appCallbacks, refreshView });

  const uiCallbacks = {
    ...appCallbacks,
    ...ioManager,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    deleteMessages: appCallbacks.deleteMessages,
    clearAllData,
  };
~~~~~
~~~~~javascript.new
  const ioManager = createIOManager({ dataAdapter, appCallbacks, refreshView });

  const closeUI = () => {
    isUIVisible.value = false;
  };

  const uiCallbacks = {
    ...appCallbacks,
    ...ioManager,
    closeUI,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    deleteMessages: appCallbacks.deleteMessages,
    clearAllData,
  };
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
  // 响应式数据拉取驱动：effect 会在创建时自动同步触发一次 refreshView
  const stopEffect = effect(() => {
    // 订阅关键路由信号
    const s = viewingServer.value;
    const c = selectedChannel.value;
    const p = currentPage.value;
    const sz = pageSize.value;
    const m = viewMode.value;

    // 使用 untracked 避免 refreshView 内部的读取操作造成循环订阅
    untracked(() => {
      refreshView();
    });
  });

  // Return Engine API
  return {
    destroy: () => {
      stopEffect();
      render(null, container);
      container.remove();
      toggleButton.remove();
    },
    updateUI: async () => {
      if (!isUIPaused.value) {
        await refreshView();
      }
    },
~~~~~
~~~~~javascript.new
  // 响应式数据拉取驱动：effect 会在创建时自动同步触发一次 refreshView
  const stopEffect = effect(() => {
    // 订阅关键路由信号
    const v = isUIVisible.value;
    const s = viewingServer.value;
    const c = selectedChannel.value;
    const p = currentPage.value;
    const sz = pageSize.value;
    const m = viewMode.value;

    // 仅在界面可见时执行昂贵的同步
    if (v) {
      untracked(() => {
        refreshView();
      });
    }
  });

  // Return Engine API
  return {
    destroy: () => {
      stopEffect();
      render(null, container);
      container.remove();
      toggleButton.remove();
    },
    updateUI: async () => {
      if (!isUIPaused.value && isUIVisible.value) {
        await refreshView();
      }
    },
~~~~~

#### Acts 3: 解耦 App.jsx 的硬编码样式操作

移除 `App.jsx` 中直接操作 DOM 的 `closeUI` 逻辑，改用 `uiCallbacks` 提供的状态修改函数。

~~~~~act
patch_file
src/ui/App.jsx
~~~~~
~~~~~javascript.old
export function App({ dataAdapter, appCallbacks }) {
  // 定义桥接到 UI 外部的回调
  const callbacks = {
    closeUI: () => {
      const container = document.getElementById('log-archive-ui-container');
      if (container) container.style.display = 'none';
    },
    copyCurrentPage: async () => {
~~~~~
~~~~~javascript.new
export function App({ dataAdapter, appCallbacks }) {
  // 定义桥接到 UI 外部的回调
  const callbacks = {
    closeUI: () => {
      appCallbacks.closeUI();
    },
    copyCurrentPage: async () => {
~~~~~

### 下一步建议
- **测试验证**: 用户可以尝试在关闭界面后进行一长串发言，随后打开界面。此时界面应能够触发“正在读取历史记录...”的加载状态，并正确渲染包含新发言的最新页面。
- **自动滚动增强**: 目前逻辑中包含 `isLockedToBottom`。我们需要观察当界面从关闭状态打开，且期间产生了足够多的消息触发了换页时，自动跳转到最后一页的逻辑是否足够丝滑。如果存在跳变感，可能需要进一步微调 `refreshView` 中的 `batch` 执行顺序。
