这是一个非常敏锐且精确的诊断。你的分析指出了手机端性能差异导致的 `MutationObserver` 事件触发间隔变长，从而使得原先 150ms 的硬编码防抖过早失效。

考虑到手机和电脑端的性能差异以及游戏潜在的变动，通过提供配置选项并配合历史记录上限的断路器机制是最佳的健壮解法。

我将生成一个实现此功能的计划。我们将：
1. 在 UI 层面新增 **"初始化防抖延迟"** 的输入框。
2. 在状态和存储层面保存该配置项。
3. 在 `main.js` 中引入动态读取配置，并加入你提到的 **“历史记录 100 条”** 拦截逻辑。

## [WIP] feat: 增加动态初始化防抖延迟设置与短路拦截保护

### 错误分析
手机端和 PC 端的 DOM 渲染性能存在显著差异。在手机端，游戏插入多条历史记录的间隔有时会超过预设的 `150ms` 防抖阈值，导致系统错误地认为历史记录已加载完毕，提前结束初始化状态。这引发了后续历史消息被错误地当作实时消息逐条处理，进而产生遗漏或时间戳错乱的问题。

### 用户需求
1. 提供一个用户可自定义的“初始化防抖延迟”设置项，替代硬编码的 150ms。
2. 加入历史记录数量的短路机制，防止因防抖时间设置过长（如 1500ms）导致在面对大量连续消息时陷入无限重置的“初始化死循环”。

### 评论
将硬编码的参数转化为用户可配置项，并辅以自动化的容量阻断，既满足了不同设备的性能差异，又保证了异常情况下的系统健壮性。

### 目标
1. 修改 UI 模板，添加延迟输入的 DOM 节点。
2. 更新 UI State 和 Storage 层以存储 `initDebounceMs`。
3. 在 `activateLogger` 中应用动态配置。
4. 在 `MutationObserver` 循环中引入 `MAX_HISTORY_NODES` 计数限制，超过阈值后不再延长防抖时钟。

### 基本原理
我们通过在 `uiControls` 暴露一个同步的读取方法 `getInitDebounceMs`，使得 `activateLogger` 能够在创建观察者时立刻获取最新配置，避免了引入 `async/await` 导致的可能潜在的竞态条件。
在 `MutationObserver` 内部，通过统计 `.chat-line` 节点的插入数量，一旦逼近或超过游戏的默认上限（100条左右），我们就不再调用 `finalizeInitialization()`。这样，现存的定时任务将在设定时间后安全执行完毕，释放初始化锁定。

### 标签
#intent/build #flow/ready #priority/high #comp/runtime #comp/ui #concept/config #scope/ux #ai/brainstorm #task/domain/core #task/object/initialization #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 扩展 UI 模板并绑定 DOM 元素

添加设置项的 HTML 结构，并在 `dom.js` 中暴露引用。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
            <div class="config-group">
                <label for="log-archive-page-size-input">分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>维护操作</label>
~~~~~
~~~~~javascript.new
            <div class="config-group">
                <label for="log-archive-page-size-input">分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label for="log-archive-init-debounce-input">初始化防抖延迟 (毫秒)</label>
                <input type="number" id="log-archive-init-debounce-input" min="50" max="5000" step="50">
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    如果在手机端加载历史记录时发生丢失或错乱，可尝试调高此值（例如 1000 或 1500）。
                </div>
            </div>
            <div class="config-group">
                <label>维护操作</label>
~~~~~

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    // Config View Controls
    serverViewSelector: document.getElementById('log-archive-server-view-selector'),
    resetServerButton: document.getElementById('log-archive-reset-server-button'),
    autoFollowInput: document.getElementById('log-archive-auto-follow-input'),
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
~~~~~
~~~~~javascript.new
    // Config View Controls
    serverViewSelector: document.getElementById('log-archive-server-view-selector'),
    resetServerButton: document.getElementById('log-archive-reset-server-button'),
    autoFollowInput: document.getElementById('log-archive-auto-follow-input'),
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    initDebounceInput: document.getElementById('log-archive-init-debounce-input'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
~~~~~

#### Acts 2: 扩展持久化配置默认值

确保底层存储在读取配置时带有默认的防抖值。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  getConfig() {
    const defaultCfg = { pageSize: 1000 };
    return new Promise((resolve) => {
      const tx = this._tx([STORE_CONFIG], 'readonly');
~~~~~
~~~~~javascript.new
  getConfig() {
    const defaultCfg = { pageSize: 1000, initDebounceMs: 150 };
    return new Promise((resolve) => {
      const tx = this._tx([STORE_CONFIG], 'readonly');
~~~~~

~~~~~act
patch_file
src/storage/local-storage.adapter.js
~~~~~
~~~~~javascript.old
  getConfig() {
    const defaultCfg = { pageSize: 1000 };
    try {
~~~~~
~~~~~javascript.new
  getConfig() {
    const defaultCfg = { pageSize: 1000, initDebounceMs: 150 };
    try {
~~~~~

#### Acts 3: 在 UI State 中整合配置并绑定事件

使得设置界面可以读取和更新这个值，并通过 `createUI` 接口暴露。

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
  const state = {
    currentPage: 1,
    pageSize: 1000,
    autoFollowServer: true,
    lastSavedTime: null,
~~~~~
~~~~~javascript.new
  const state = {
    currentPage: 1,
    pageSize: 1000,
    initDebounceMs: 150,
    autoFollowServer: true,
    lastSavedTime: null,
~~~~~

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
  // Async load config
  const config = await storageManager.getConfig();
  state.pageSize = config.pageSize || 1000;
  state.autoFollowServer = config.autoFollowServer !== false; // 默认为 true

  const saveConfig = async () => {
    await storageManager.saveConfig({
      pageSize: state.pageSize,
      autoFollowServer: state.autoFollowServer,
    });
  };
~~~~~
~~~~~javascript.new
  // Async load config
  const config = await storageManager.getConfig();
  state.pageSize = config.pageSize || 1000;
  state.initDebounceMs = config.initDebounceMs || 150;
  state.autoFollowServer = config.autoFollowServer !== false; // 默认为 true

  const saveConfig = async () => {
    await storageManager.saveConfig({
      pageSize: state.pageSize,
      initDebounceMs: state.initDebounceMs,
      autoFollowServer: state.autoFollowServer,
    });
  };
~~~~~

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    setPageSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        await saveConfig();
      }
    },
    setAutoFollowServer: async (enabled) => {
~~~~~
~~~~~javascript.new
    setPageSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        await saveConfig();
      }
    },
    setInitDebounceMs: async (ms) => {
      const val = Number.parseInt(ms, 10);
      if (!Number.isNaN(val) && val >= 50) {
        state.initDebounceMs = val;
        await saveConfig();
      }
    },
    setAutoFollowServer: async (enabled) => {
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.pageSizeInput.addEventListener('change', async () => {
    await uiState.setPageSize(dom.pageSizeInput.value);
    triggerRefresh();
  });

  dom.autoFollowInput.addEventListener('change', async () => {
~~~~~
~~~~~javascript.new
  dom.pageSizeInput.addEventListener('change', async () => {
    await uiState.setPageSize(dom.pageSizeInput.value);
    triggerRefresh();
  });

  dom.initDebounceInput.addEventListener('change', async () => {
    await uiState.setInitDebounceMs(dom.initDebounceInput.value);
  });

  dom.autoFollowInput.addEventListener('change', async () => {
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  // --- Initial value setup ---
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.autoFollowInput.checked = uiState.getState().autoFollowServer;
}
~~~~~
~~~~~javascript.new
  // --- Initial value setup ---
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.initDebounceInput.value = uiState.getState().initDebounceMs;
  dom.autoFollowInput.checked = uiState.getState().autoFollowServer;
}
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        refreshView();
      }
    },
    setState: (newState) => {
      refreshView();
    },
    checkStorageUsage: async () => await renderer.checkStorageUsage(),
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      refreshView();
    },
  };
}
~~~~~
~~~~~javascript.new
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        refreshView();
      }
    },
    setState: (newState) => {
      refreshView();
    },
    checkStorageUsage: async () => await renderer.checkStorageUsage(),
    isUIPaused: () => uiState.getState().isUIPaused,
    getInitDebounceMs: () => uiState.getState().initDebounceMs,
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      refreshView();
    },
  };
}
~~~~~

#### Acts 4: 重构 `activateLogger` 并加入短路拦截逻辑

提取动态的防抖时间，并根据接收到的节点数量实行防抖抑制。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /**
   * 激活聊天记录器。
   */
  function activateLogger() {
    const { chatLog, tabs: tabsContainer } = locateChatElements();
    if (!chatLog || !tabsContainer || messageObserver) return;

    isInitializingChat = true;

    const handleTabChange = () => {
~~~~~
~~~~~javascript.new
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
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    tabObserver.observe(tabsContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    const finalizeInitialization = debounce(async () => {
      // 关键：在开始异步扫描前就解锁实时监听。
      // 通道 B 现在有了实时查重，它会自动处理与扫描快照重叠的消息。
      // 这彻底消除了之前在 await 期间的消息丢失盲区。
      isInitializingChat = false;
      await scanAndMergeHistory();
    }, 150);

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
~~~~~
~~~~~javascript.new
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
~~~~~

### 下一步建议
我们已经安全地引入了动态防抖和防死锁保护，你可以构建并使用手机端进行实际测试，通过将防抖增加到 1000 甚至 1500 来验证问题是否彻底得到解决。
