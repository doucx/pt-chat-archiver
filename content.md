好的，我明白了。由于我们已经从 V6 的“全量覆盖写入”迁移到了 V7 (IndexedDB) 的“增量实时写入”，旧的“定时自动保存”逻辑确实已经失去了存在的意义（现在每条消息都是即时入库的）。

我将从 UI 模板、状态管理、事件绑定以及存储适配器中彻底移除所有关于 `autoSaveInterval` 的代码。

## [WIP] refactor: 移除不再使用的“自动保存间隔”功能及其相关逻辑

### 用户需求
删除 UI 界面中的“自动保存间隔”设置项，并清理代码库中与之关联的所有逻辑、状态及配置字段。

### 评论
这是一个非常合理的清理操作。在 IndexedDB 架构下，消息是原子化即时写入的，不再需要像 LocalStorage 时代那样为了性能平衡而设置一个“保存间隔”。移除该功能可以简化配置界面，减少用户的认知负担，并精简代码。

### 目标
1.  从 `src/ui/templates.js` 中移除相关的 HTML 设置项。
2.  从 `src/ui/dom.js` 中移除对应的 DOM 元素引用。
3.  从 `src/ui/state.js` 中移除 `autoSaveInterval` 状态及其 Setter 方法。
4.  从 `src/ui/events.js` 中移除对应的事件监听器。
5.  从 `src/storage` 适配器中移除默认配置项。
6.  清理 `src/main.js` 和 `src/ui/index.js` 中的冗余回调和导出。

### 基本原理
通过逐层扫描和删除，确保该功能从数据流（Storage -> State）到视图流（State -> DOM -> Event）完整剥离。我们将保留 `saveConfig` 方法，但不再传递或处理 `autoSaveInterval` 字段。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #comp/storage #concept/config #scope/dx #scope/ux #ai/instruct #task/domain/ui #task/object/auto-save-config #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 清理 UI 模板与 DOM 引用

我们将移除设置界面中的输入框 HTML 结构及 DOM 缓存。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
            <div class="config-group">
                <label for="log-archive-auto-save-interval">自动保存间隔 (秒)</label>
                <input type="number" id="log-archive-auto-save-interval" min="5" max="3600" step="5">
            </div>
            <div class="config-group">
~~~~~
~~~~~javascript.new
            <div class="config-group">
~~~~~

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    autoSaveIntervalInput: document.getElementById('log-archive-auto-save-interval'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
~~~~~
~~~~~javascript.new
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
~~~~~

#### Acts 2: 移除 UI 状态管理逻辑

在 `state.js` 中移除字段声明、初始化逻辑和 Setter 方法。

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    currentPage: 1,
    pageSize: 1000,
    autoSaveInterval: 30,
    autoFollowServer: true,
~~~~~
~~~~~javascript.new
    currentPage: 1,
    pageSize: 1000,
    autoFollowServer: true,
~~~~~

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
  // Async load config
  const config = await storageManager.getConfig();
  state.pageSize = config.pageSize || 1000;
  state.autoSaveInterval = config.autoSaveInterval || 30;
  state.autoFollowServer = config.autoFollowServer !== false; // 默认为 true

  const saveConfig = async () => {
    await storageManager.saveConfig({
      pageSize: state.pageSize,
      autoSaveInterval: state.autoSaveInterval,
      autoFollowServer: state.autoFollowServer,
    });
  };
~~~~~
~~~~~javascript.new
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
    setAutoSaveInterval: async (seconds) => {
      const val = Number.parseInt(seconds, 10);
      if (!Number.isNaN(val) && val >= 5) {
        state.autoSaveInterval = val;
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
    setAutoFollowServer: async (enabled) => {
~~~~~

#### Acts 3: 清理事件绑定与 UI 入口

移除 `events.js` 中的监听器以及 `index.js` 和 `main.js` 中的冗余导出。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.pageSizeInput.addEventListener('change', async () => {
    await uiState.setPageSize(dom.pageSizeInput.value);
    triggerRefresh();
  });

  dom.autoSaveIntervalInput.addEventListener('change', async () => {
    await uiState.setAutoSaveInterval(dom.autoSaveIntervalInput.value);
    callbacks.onAutoSaveIntervalChange();
    triggerRefresh();
  });

  dom.autoFollowInput.addEventListener('change', async () => {
~~~~~
~~~~~javascript.new
  dom.pageSizeInput.addEventListener('change', async () => {
    await uiState.setPageSize(dom.pageSizeInput.value);
    triggerRefresh();
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
  dom.autoSaveIntervalInput.value = uiState.getState().autoSaveInterval;
  dom.autoFollowInput.checked = uiState.getState().autoFollowServer;
}
~~~~~
~~~~~javascript.new
  // --- Initial value setup ---
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.autoFollowInput.checked = uiState.getState().autoFollowServer;
}
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      refreshView();
    },
    getAutoSaveInterval: () => uiState.getState().autoSaveInterval,
  };
}
~~~~~
~~~~~javascript.new
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      refreshView();
    },
  };
}
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  let isSwitchingTabs = false;
  // UI 控制句柄
  let uiControls = null;
  const autoSaveTimer = null;

  // 用于保证实时消息绝对单调递增的全局时钟状态
~~~~~
~~~~~javascript.new
  let isSwitchingTabs = false;
  // UI 控制句柄
  let uiControls = null;

  // 用于保证实时消息绝对单调递增的全局时钟状态
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
      onAutoSaveIntervalChange: () => {}, // 设置间隔仅为了兼容旧UI交互
      replaceState: async (newState) => {
~~~~~
~~~~~javascript.new
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
      replaceState: async (newState) => {
~~~~~

#### Acts 4: 更新存储层默认配置

在存储适配器中移除 `autoSaveInterval` 的默认值。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  /**
   * 获取配置
   */
  getConfig() {
    const defaultCfg = { pageSize: 1000, autoSaveInterval: 30 };
    return new Promise((resolve) => {
~~~~~
~~~~~javascript.new
  /**
   * 获取配置
   */
  getConfig() {
    const defaultCfg = { pageSize: 1000 };
    return new Promise((resolve) => {
~~~~~

~~~~~act
patch_file
src/storage/local-storage.adapter.js
~~~~~
~~~~~javascript.old
  getConfig() {
    const defaultCfg = { pageSize: 1000, autoSaveInterval: 30 };
    try {
~~~~~
~~~~~javascript.new
  getConfig() {
    const defaultCfg = { pageSize: 1000 };
    try {
~~~~~

### 下一步建议
我们已经移除了“自动保存间隔”的相关逻辑。由于现在系统是实时保存的，你可以观察一下在消息极高频触发时（例如 Pony Town 某些极其活跃的公开频道）的写入性能。如果发现掉帧，后续我们可以考虑在 `putMessages` 层面引入一个极其微小的缓存缓冲，但这与之前的 `autoSaveInterval` 概念完全不同。

目前的修改已经让代码变得更干净了。如果你确认无误，我们可以提交这些变更。
