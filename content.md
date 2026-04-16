根据您的要求，我将为 PT Chat Archiver 添加两个新的配置选项：**统计分析上限（倒序）** 和 **数据读取分块大小**。这涉及从存储层到 UI 层的全链路修改。

## [WIP] feat: 添加统计上限与读取块大小的可配置选项

### 用户需求
1.  **统计报告拉取上限**: 允许用户设置统计分析时拉取的最近消息数量（倒序），避免在海量数据下分析过慢。
2.  **数据读取分块大小**: 将原先硬编码在 `IndexedDBAdapter` 中的 `250` 条分块大小提取为配置项，允许用户根据设备性能调整加载流畅度。

### 评论
随着用户存档数据量的增加，全量统计或大块读取可能会导致 UI 线程出现明显的卡顿。引入这两个选项能显著提升大额数据下的用户体验。

### 目标
1.  在设置界面添加两个新的数字输入框。
2.  在 `createUIState` 中管理这两个新状态并持久化。
3.  在 `IndexedDBAdapter` 中应用动态的 `readChunkSize`。
4.  在 `refreshView` 控制器中根据 `statsLimit` 计算倒序拉取的起始位置。

### 基本原理
我们将配置项存储在 IndexedDB 的 `config` 存储空间中。在读取数据时，适配器会优先读取这些配置。对于统计报告，我们将计算出一个 `offset`，使得 `getMessages` 能够精准拉取最后 N 条记录，而不是仅仅拉取最后一页。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #comp/storage #concept/config #scope/ux #ai/delegate #task/domain/ui #task/object/config-options #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 更新 UI 模板与 DOM 引用

添加 HTML 结构并让程序能够获取到这两个新输入框。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~html.old
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
~~~~~html.new
            <div class="config-group">
                <label for="log-archive-page-size-input">分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label for="log-archive-stats-limit-input">统计分析上限 (最近消息数)</label>
                <input type="number" id="log-archive-stats-limit-input" min="100" max="100000" step="500">
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    限制统计报告分析的最近消息数量。值越大分析越准，但生成越慢。
                </div>
            </div>
            <div class="config-group">
                <label for="log-archive-chunk-size-input">数据读取分块大小 (Chunk Size)</label>
                <input type="number" id="log-archive-chunk-size-input" min="50" max="5000" step="50">
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    控制读取数据库时的每块大小。较小的值能提供更平滑的进度条。
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
~~~~~
~~~~~javascript.new
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    statsLimitInput: document.getElementById('log-archive-stats-limit-input'),
    chunkSizeInput: document.getElementById('log-archive-chunk-size-input'),
    initDebounceInput: document.getElementById('log-archive-init-debounce-input'),
~~~~~

#### Acts 2: 更新状态管理逻辑

在 `state.js` 中增加字段并实现 Setter。

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
~~~~~javascript.old
    setPageSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        await saveConfig();
      }
    },
    setInitDebounceMs: async (ms) => {
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
      if (!Number.isNaN(val) && val >= 10) {
        state.readChunkSize = val;
        await saveConfig();
      }
    },
    setInitDebounceMs: async (ms) => {
~~~~~

#### Acts 3: 绑定事件与渲染初始化

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
    triggerRefresh();
  });

  dom.chunkSizeInput.addEventListener('change', async () => {
    await uiState.setReadChunkSize(dom.chunkSizeInput.value);
  });

  dom.initDebounceInput.addEventListener('change', async () => {
~~~~~
~~~~~javascript.old
  // --- Initial value setup ---
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.initDebounceInput.value = uiState.getState().initDebounceMs;
  dom.autoFollowInput.checked = uiState.getState().autoFollowServer;
}
~~~~~
~~~~~javascript.new
  // --- Initial value setup ---
  const currentState = uiState.getState();
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = currentState.pageSize;
  dom.statsLimitInput.value = currentState.statsLimit;
  dom.chunkSizeInput.value = currentState.readChunkSize;
  dom.initDebounceInput.value = currentState.initDebounceMs;
  dom.autoFollowInput.checked = currentState.autoFollowServer;
}
~~~~~

#### Acts 4: 修改适配器以支持动态 Offset 和分块大小

为了支持“倒序最近 N 条”，我们需要让 `getMessages` 接收一个可选的起始偏移量 `offset`。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  getChannelCount(server, channel) {
    if (!server || !channel) return Promise.resolve(0);
    // 优先返回缓存
    if (this.cache.counts[server] && this.cache.counts[server][channel] !== undefined) {
      return Promise.resolve(this.cache.counts[server][channel]);
    }

    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
      const countReq = index.count(range);
      countReq.onsuccess = () => {
        const count = countReq.result;
        if (!this.cache.counts[server]) this.cache.counts[server] = {};
        this.cache.counts[server][channel] = count;
        resolve(count);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  }

  async getMessages(server, channel, page, pageSize, onProgress) {
    if (!server || !channel) return { messages: [], total: 0 };
    const total = await this.getChannelCount(server, channel);
    const messages = [];
    const start = (page - 1) * pageSize;

    if (start >= total || total === 0) {
      return { messages, total };
    }

    // 核心优化：双向游标
    const reverse = start > total / 2;
    let direction = 'next';
    let advanceCount = start;

    if (reverse) {
      direction = 'prev';
      const lastIndexWanted = Math.min(start + pageSize - 1, total - 1);
      advanceCount = total - 1 - lastIndexWanted;
    }

    // 如果没有进度汇报需求，执行单次优化读取
    if (!onProgress) {
      const result = await this._getMessagesSingleTx(
        server,
        channel,
        advanceCount,
        pageSize,
        direction,
        total,
        reverse,
      );
      return result;
    }

    // 分块读取以支持进度汇报，避免长时间阻塞主线程
    const chunkSize = 250;
    const totalToFetch = Math.min(pageSize, total - start);
    let currentSkip = advanceCount;

    while (messages.length < totalToFetch) {
      const limit = Math.min(chunkSize, totalToFetch - messages.length);
      const chunkResult = await this._getMessagesSingleTx(
        server,
        channel,
        currentSkip,
        limit,
        direction,
        total,
        false,
      );

      if (chunkResult.messages.length === 0) break;

      messages.push(...chunkResult.messages);
      currentSkip += chunkResult.messages.length;

      if (onProgress) {
        onProgress(messages.length, totalToFetch);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (reverse) {
      messages.reverse();
    }

    return { messages, total };
  }
~~~~~
~~~~~javascript.new
  getChannelCount(server, channel) {
    if (!server || !channel) return Promise.resolve(0);
    // 优先返回缓存
    if (this.cache.counts[server] && this.cache.counts[server][channel] !== undefined) {
      return Promise.resolve(this.cache.counts[server][channel]);
    }

    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
      const countReq = index.count(range);
      countReq.onsuccess = () => {
        const count = countReq.result;
        if (!this.cache.counts[server]) this.cache.counts[server] = {};
        this.cache.counts[server][channel] = count;
        resolve(count);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  }

  async getMessages(server, channel, page, pageSize, onProgress, offset = null) {
    if (!server || !channel) return { messages: [], total: 0 };
    const total = await this.getChannelCount(server, channel);
    const messages = [];
    const start = offset !== null ? offset : (page - 1) * pageSize;

    if (start >= total || total === 0) {
      return { messages, total };
    }

    // 核心优化：双向游标
    const reverse = start > total / 2;
    let direction = 'next';
    let advanceCount = start;

    if (reverse) {
      direction = 'prev';
      const lastIndexWanted = Math.min(start + pageSize - 1, total - 1);
      advanceCount = total - 1 - lastIndexWanted;
    }

    // 如果没有进度汇报需求，执行单次优化读取
    if (!onProgress) {
      const result = await this._getMessagesSingleTx(
        server,
        channel,
        advanceCount,
        pageSize,
        direction,
        total,
        reverse,
      );
      return result;
    }

    // 分块读取以支持进度汇报，避免长时间阻塞主线程
    const config = await this.getConfig();
    const chunkSize = config.readChunkSize || 250;
    const totalToFetch = Math.min(pageSize, total - start);
    let currentSkip = advanceCount;

    while (messages.length < totalToFetch) {
      const limit = Math.min(chunkSize, totalToFetch - messages.length);
      const chunkResult = await this._getMessagesSingleTx(
        server,
        channel,
        currentSkip,
        limit,
        direction,
        total,
        false,
      );

      if (chunkResult.messages.length === 0) break;

      messages.push(...chunkResult.messages);
      currentSkip += chunkResult.messages.length;

      if (onProgress) {
        onProgress(messages.length, totalToFetch);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (reverse) {
      messages.reverse();
    }

    return { messages, total };
  }
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
    const defaultCfg = { pageSize: 1000, statsLimit: 5000, readChunkSize: 250, initDebounceMs: 150 };
    return new Promise((resolve) => {
~~~~~

#### Acts 5: 在控制器中应用统计上限逻辑

修改 `refreshView`，在 `stats` 模式下计算精准的倒序 `offset`。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
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
      if (renderId !== currentRenderId) return; // 竞态控制：丢弃过期的渲染请求

      // 如果是 stats 模式，计算拉取范围
      let fetchPage = currentPage;
      let fetchSize = pageSize;
      let fetchOffset = null;

      if (viewMode === 'stats') {
        const statsLimit = uiState.getState().statsLimit;
        fetchSize = statsLimit;
        fetchPage = 1;
        // 计算 Offset 以获取最后 N 条记录
        fetchOffset = Math.max(0, totalCount - statsLimit);
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
        fetchOffset,
      );
~~~~~

### 下一步建议

1.  **性能基准测试**: 建议在拥有超过 50,000 条记录的频道上测试 `statsLimit` 设置为不同值时的响应速度。
2.  **导出范围控制**: 目前的 JSON/TXT 导出仍然是全量的。未来可以考虑引入一个类似的“导出范围限制”或“按日期导出”功能。
3.  **UI 提示优化**: 当用户设置的 `readChunkSize` 过大（例如 > 1000）时，在设置界面显示一个黄色警告，提示这可能会导致进度条更新不及时或 UI 短暂卡顿。
