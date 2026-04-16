你的分析非常准确。为了提高统计性能并增强系统的灵活性，我们需要将这两个关键参数从硬编码改为用户可配置。

这是一个典型的跨层变更：从最底层的 `IndexedDBAdapter` 到最外层的 `templates.js` 及其间的状态管理逻辑。

我将生成一个计划来实现这些改动。

## [WIP] feat: 支持自定义统计上限与读取分片大小

### 用户需求
1.  在设置界面添加“统计报告拉取上限”配置，避免在数万条记录时生成统计导致界面卡死。
2.  在设置界面添加“数据库读取分片大小”配置（原硬编码 250），允许用户根据设备性能优化读取速度。

### 评论
随着用户存档数据量的增长，全量分析（`stats` 模式）的成本呈指数级上升。引入 `statsLimit` 可以保证分析操作在可控的时间内完成。同时，暴露 `readChunkSize` 是对开发者体验和高级用户的赋能，有助于在不同硬件环境下找到性能平衡点。

### 目标
1.  **UI 扩展**: 在设置 HTML 模板中新增两个数字输入项。
2.  **状态持久化**: 在 `uiState` 中管理新参数，并确保其同步到存储层。
3.  **适配器动态化**: 修改 `IndexedDBAdapter`，使其读取操作响应配置变化。
4.  **控制器逻辑优化**: 在 `refreshView` 中实现倒序切片逻辑，仅拉取最后 N 条记录用于统计。

### 基本原理
1.  **配置流**: `createUIState` 初始化时从存储加载配置，并暴露 Setter 触发持久化。
2.  **分片读取**: `IndexedDBAdapter.getMessages` 将使用 `config` 中定义的 `readChunkSize` 代替硬编码的数字。
3.  **倒序统计**: 在 `refreshView` 中，如果处于 `stats` 模式，我们将计算 `start = Math.max(0, totalCount - statsLimit)`，并通过更新后的 `getMessages` 接口（增加 `offset` 支持）获取数据。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #comp/engine #concept/config #scope/ux #scope/dx #ai/brainstorm #task/domain/storage #task/object/configuration #task/action/extension #task/state/begin

---

### Script

#### Acts 1: 更新设置界面模板与 DOM 引用

在设置视图中添加新的配置项，并建立 JS 引用。

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
                <label for="log-archive-init-debounce-input">初始化防抖延迟 (毫秒)</label>
                <input type="number" id="log-archive-init-debounce-input" min="50" max="5000" step="50">
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    如果在手机端加载历史记录时发生丢失或错乱，可尝试调高此值（例如 1000 或 1500）。
                </div>
            </div>
~~~~~
~~~~~javascript.new
            <div class="config-group">
                <label for="log-archive-page-size-input">分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label for="log-archive-stats-limit-input">统计分析上限 (最后 N 条)</label>
                <input type="number" id="log-archive-stats-limit-input" min="100" max="50000" step="500">
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    生成统计报告时分析的消息数量。设置过大可能导致低端设备短暂卡死。
                </div>
            </div>
            <div class="config-group">
                <label for="log-archive-read-chunk-input">数据库读取分片大小</label>
                <input type="number" id="log-archive-read-chunk-input" min="50" max="2000" step="50">
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    内部读取数据时的分片步长。默认 250，若设备性能强劲可调高至 500-1000 以提升加载速度。
                </div>
            </div>
            <div class="config-group">
                <label for="log-archive-init-debounce-input">初始化防抖延迟 (毫秒)</label>
                <input type="number" id="log-archive-init-debounce-input" min="50" max="5000" step="50">
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    如果在手机端加载历史记录时发生丢失或错乱，可尝试调高此值（例如 1000 或 1500）。
                </div>
            </div>
~~~~~

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    initDebounceInput: document.getElementById('log-archive-init-debounce-input'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
~~~~~
~~~~~javascript.new
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    statsLimitInput: document.getElementById('log-archive-stats-limit-input'),
    readChunkInput: document.getElementById('log-archive-read-chunk-input'),
    initDebounceInput: document.getElementById('log-archive-init-debounce-input'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
~~~~~

#### Acts 2: 扩展 UI 状态管理与持久化逻辑

在 `state.js` 中增加新字段的默认值加载和 Setter 方法。

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    currentPage: 1,
    pageSize: 1000,
    initDebounceMs: 150,
    autoFollowServer: true,
~~~~~
~~~~~javascript.new
    currentPage: 1,
    pageSize: 1000,
    statsLimit: 5000,
    readChunkSize: 250,
    initDebounceMs: 150,
    autoFollowServer: true,
~~~~~
~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
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
~~~~~javascript.new
  state.pageSize = config.pageSize || 1000;
  state.statsLimit = config.statsLimit || 5000;
  state.readChunkSize = config.readChunkSize || 250;
  state.initDebounceMs = config.initDebounceMs || 150;
  state.autoFollowServer = config.autoFollowServer !== false; // 默认为 true

  const saveConfig = async () => {
    await storageManager.saveConfig({
      pageSize: state.pageSize,
      statsLimit: state.statsLimit,
      readChunkSize: state.readChunkSize,
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
~~~~~
~~~~~javascript.new
    setPageSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        await saveConfig();
      }
    },
    setStatsLimit: async (limit) => {
      const val = Number.parseInt(limit, 10);
      if (!Number.isNaN(val) && val >= 100) {
        state.statsLimit = val;
        await saveConfig();
      }
    },
    setReadChunkSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 50) {
        state.readChunkSize = val;
        await saveConfig();
      }
    },
~~~~~

#### Acts 3: 绑定 UI 事件

监听新的输入框变更，并同步初始值。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.pageSizeInput.addEventListener('change', async () => {
    await uiState.setPageSize(dom.pageSizeInput.value);
    triggerRefresh();
  });

  dom.initDebounceInput.addEventListener('change', async () => {
~~~~~
~~~~~javascript.new
  dom.pageSizeInput.addEventListener('change', async () => {
    await uiState.setPageSize(dom.pageSizeInput.value);
    triggerRefresh();
  });

  dom.statsLimitInput.addEventListener('change', async () => {
    await uiState.setStatsLimit(dom.statsLimitInput.value);
  });

  dom.readChunkInput.addEventListener('change', async () => {
    await uiState.setReadChunkSize(dom.readChunkInput.value);
  });

  dom.initDebounceInput.addEventListener('change', async () => {
~~~~~
~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.initDebounceInput.value = uiState.getState().initDebounceMs;
~~~~~
~~~~~javascript.new
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.statsLimitInput.value = uiState.getState().statsLimit;
  dom.readChunkInput.value = uiState.getState().readChunkSize;
  dom.initDebounceInput.value = uiState.getState().initDebounceMs;
~~~~~

#### Acts 4: 修改数据库适配器以支持动态分片与 Offset

我们将修改 `getMessages` 接口，使其支持通过配置控制分片大小，并允许直接传入 `offset` 覆盖分页计算。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  /**
   * 获取配置
   */
  getConfig() {
    const defaultCfg = { pageSize: 1000, initDebounceMs: 150 };
    return new Promise((resolve) => {
~~~~~
~~~~~javascript.new
  /**
   * 获取配置
   */
  getConfig() {
    const defaultCfg = {
      pageSize: 1000,
      statsLimit: 5000,
      readChunkSize: 250,
      initDebounceMs: 150,
    };
    return new Promise((resolve) => {
~~~~~
~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  async getMessages(server, channel, page, pageSize, onProgress) {
    if (!server || !channel) return { messages: [], total: 0 };
    const total = await this.getChannelCount(server, channel);
    const messages = [];
    const start = (page - 1) * pageSize;
~~~~~
~~~~~javascript.new
  async getMessages(server, channel, page, pageSize, onProgress, offsetOverride) {
    if (!server || !channel) return { messages: [], total: 0 };
    const total = await this.getChannelCount(server, channel);
    const messages = [];
    const start = offsetOverride !== undefined ? offsetOverride : (page - 1) * pageSize;
~~~~~
~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
    // 分块读取以支持进度汇报，避免长时间阻塞主线程
    const chunkSize = 250;
    const totalToFetch = Math.min(pageSize, total - start);
~~~~~
~~~~~javascript.new
    // 分块读取以支持进度汇报，避免长时间阻塞主线程
    const config = await this.getConfig();
    const chunkSize = config.readChunkSize || 250;
    const totalToFetch = Math.min(pageSize, total - start);
~~~~~

#### Acts 5: 优化控制器中的统计数据拉取逻辑

更新 `src/ui/index.js` 中的 `refreshView` 控制器，在 `stats` 模式下计算正确的 Offset 和 Limit，仅拉取最后 N 条记录。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      // 渲染非阻塞化：显示准备读取的状态并让出主线程
      dom.logDisplay.value = '⏳ 正在准备读取数据...';
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (renderId !== currentRenderId) return; // 竞态控制：丢弃过期的渲染请求

      // 如果是 stats 模式，可能需要全量数据 (Phase 1 临时兼容)
      const fetchSize = viewMode === 'stats' ? 999999 : pageSize;
      const fetchPage = viewMode === 'stats' ? 1 : currentPage;

      const result = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        fetchPage,
        fetchSize,
        (current, total) => {
~~~~~
~~~~~javascript.new
    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      // 渲染非阻塞化：显示准备读取的状态并让出主线程
      dom.logDisplay.value = '⏳ 正在准备读取数据...';
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (renderId !== currentRenderId) return; // 竞态控制：丢弃过期的渲染请求

      let fetchSize = pageSize;
      let fetchPage = currentPage;
      let offset = undefined;

      if (viewMode === 'stats') {
        const { statsLimit } = uiState.getState();
        fetchSize = statsLimit;
        // 核心优化：只拉取最后 N 条消息进行统计
        offset = Math.max(0, totalCount - statsLimit);
        fetchPage = 1; // 在指定 offset 时 page 仅作为占位
      }

      const result = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        fetchPage,
        fetchSize,
        (current, total) => {
          if (renderId !== currentRenderId) return;
          const width = 20;
          const percentage = current / total;
          const filled = Math.round(width * percentage);
          const empty = width - filled;
          const bar = `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
          dom.logDisplay.value = `⏳ 正在读取历史记录...\n\n    ${bar} ${Math.round(percentage * 100)}%\n    已读取: ${current} / ${total} 条`;
        },
        offset,
      );
~~~~~

### 下一步建议
-   **存储配额检查**: 虽然 IndexedDB 不像 LocalStorage 那样有 5MB 的死限制，但在移动端浏览器上依然有配额限制（通常取决于磁盘剩余空间）。下一步可以考虑在 `checkStorageUsage` 中利用 `navigator.storage.estimate()` 为用户提供更准确的存储健康度报告。
-   **统计性能下钻**: 如果用户将统计上限调得很大，即使拉取速度快，`analysis.js` 中的同步计算逻辑依然可能阻塞主线程。可以考虑将 `calculateTopTalkers` 等函数改为分片处理或 Web Worker。
