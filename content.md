## [WIP] perf: 优化大规模记录下的分页与视图切换性能

### 用户需求
在积累大量消息后，打开设置页面和进行分页操作时存在明显卡顿，希望解决该性能问题。

### 评论
由于历史限制，目前的分页直接依赖了 IndexedDB 游标的 `advance` 方法，在大偏移量下会产生严重的性能退化（尤其是在最新的尾页）。本次优化不改变核心数据结构，纯粹通过计算几何方向的捷径和并行化策略就能彻底解决这个痛点，极具性价比。

### 目标
1. 为 `IndexedDBAdapter` 的分页加入智能的双向游标 `prev`/`next` 判断。
2. 为存储和数据适配层添加专用的 `getChannelCount` 接口。
3. 在 UI 层使用 `Promise.all` 提速统计查询，并在设置模式下跳过正文数据查询。

### 基本原理
IndexedDB 不支持原生的 Offset，但支持双向游标。通过 `total` 和 `start` 比较，当请求的页面位于下半区时，从末尾用 `prev` 游标逆向推进，可以极大地减少无效节点遍历数。此外，将无用或可并行的长耗时操作进行解耦，符合响应式 UI 的最佳实践。

### 标签
#intent/refine #flow/ready #priority/high #comp/runtime #comp/ui #concept/sync #scope/core #scope/ux #ai/brainstorm #task/domain/performance #task/object/pagination #task/action/optimize #task/state/begin

---

### Script

#### Acts 1: 在存储层支持专用 Count 和双向游标

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  getChannels(server) {
    if (!server) return Promise.resolve([]);
    if (this.cache.channels[server]) return Promise.resolve([...this.cache.channels[server]]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel');
      const range = IDBKeyRange.bound([server, ''], [server, '\uffff']);
      const req = index.openKeyCursor(range, 'nextunique');
      const channels = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          channels.push(cursor.key[1]);
          cursor.continue();
        } else {
          this.cache.channels[server] = channels;
          resolve([...channels]);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  getMessages(server, channel, page, pageSize) {
    if (!server || !channel) return Promise.resolve({ messages: [], total: 0 });
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);

      const countReq = index.count(range);
      countReq.onsuccess = () => {
        const total = countReq.result;
        const messages = [];
        const start = (page - 1) * pageSize;

        if (start >= total || total === 0) {
          return resolve({ messages, total });
        }

        const cursorReq = index.openCursor(range, 'next');
        let advanced = false;

        cursorReq.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) {
            return resolve({ messages, total });
          }
          if (start > 0 && !advanced) {
            advanced = true;
            cursor.advance(start);
          } else {
            messages.push(cursor.value);
            if (messages.length < pageSize) {
              cursor.continue();
            } else {
              resolve({ messages, total });
            }
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  }
~~~~~
~~~~~javascript.new
  getChannels(server) {
    if (!server) return Promise.resolve([]);
    if (this.cache.channels[server]) return Promise.resolve([...this.cache.channels[server]]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel');
      const range = IDBKeyRange.bound([server, ''], [server, '\uffff']);
      const req = index.openKeyCursor(range, 'nextunique');
      const channels = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          channels.push(cursor.key[1]);
          cursor.continue();
        } else {
          this.cache.channels[server] = channels;
          resolve([...channels]);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  getChannelCount(server, channel) {
    if (!server || !channel) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
      const countReq = index.count(range);
      countReq.onsuccess = () => resolve(countReq.result);
      countReq.onerror = () => reject(countReq.error);
    });
  }

  getMessages(server, channel, page, pageSize) {
    if (!server || !channel) return Promise.resolve({ messages: [], total: 0 });
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);

      const countReq = index.count(range);
      countReq.onsuccess = () => {
        const total = countReq.result;
        const messages = [];
        const start = (page - 1) * pageSize;

        if (start >= total || total === 0) {
          return resolve({ messages, total });
        }

        // 核心优化：双向游标
        // 当需要跳过的记录数超过总数的一半时，改为从末尾反向遍历，大幅减少光标 advance() 的性能损耗。
        const reverse = start > total / 2;
        let direction = 'next';
        let advanceCount = start;

        if (reverse) {
          direction = 'prev';
          const lastIndexWanted = Math.min(start + pageSize - 1, total - 1);
          advanceCount = total - 1 - lastIndexWanted;
        }

        const cursorReq = index.openCursor(range, direction);
        let advanced = false;

        cursorReq.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) {
            if (reverse) messages.reverse();
            return resolve({ messages, total });
          }
          if (advanceCount > 0 && !advanced) {
            advanced = true;
            cursor.advance(advanceCount);
          } else {
            messages.push(cursor.value);
            if (messages.length < pageSize) {
              cursor.continue();
            } else {
              if (reverse) messages.reverse();
              resolve({ messages, total });
            }
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  }
~~~~~

#### Acts 2: 在管理器中暴露 Count

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  getChannels(server) {
    if (this.adapter?.getChannels) return this.adapter.getChannels(server);
    return Promise.resolve([]);
  }

  getMessages(server, channel, page, pageSize) {
    if (this.adapter?.getMessages) return this.adapter.getMessages(server, channel, page, pageSize);
    return Promise.resolve({ messages: [], total: 0 });
  }
~~~~~
~~~~~javascript.new
  getChannels(server) {
    if (this.adapter?.getChannels) return this.adapter.getChannels(server);
    return Promise.resolve([]);
  }

  getChannelCount(server, channel) {
    if (this.adapter?.getChannelCount) return this.adapter.getChannelCount(server, channel);
    if (this.adapter?.getMessages) return this.adapter.getMessages(server, channel, 1, 1).then(r => r.total);
    return Promise.resolve(0);
  }

  getMessages(server, channel, page, pageSize) {
    if (this.adapter?.getMessages) return this.adapter.getMessages(server, channel, page, pageSize);
    return Promise.resolve({ messages: [], total: 0 });
  }
~~~~~

#### Acts 3: 在主 DataAdapter 提供接口

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    // 构建 DataAdapter：UI 层与数据层的隔离界面
    const dataAdapter = {
      getServers: async () => await storageManager.getServers(),
      getChannels: async (server) => await storageManager.getChannels(server),
      getMessages: async (server, channel, page, pageSize) => {
        return await storageManager.getMessages(server, channel, page, pageSize);
      },
      getMessagesChunk: async (server, channel, lastTime, limit) => {
        return await storageManager.getMessagesChunk(server, channel, lastTime, limit);
      },
      getAllData: async () => await storageManager.loadAllV6(), // 用于导出功能
    };
~~~~~
~~~~~javascript.new
    // 构建 DataAdapter：UI 层与数据层的隔离界面
    const dataAdapter = {
      getServers: async () => await storageManager.getServers(),
      getChannels: async (server) => await storageManager.getChannels(server),
      getChannelCount: async (server, channel) => await storageManager.getChannelCount(server, channel),
      getMessages: async (server, channel, page, pageSize) => {
        return await storageManager.getMessages(server, channel, page, pageSize);
      },
      getMessagesChunk: async (server, channel, lastTime, limit) => {
        return await storageManager.getMessagesChunk(server, channel, lastTime, limit);
      },
      getAllData: async () => await storageManager.loadAllV6(), // 用于导出功能
    };
~~~~~

#### Acts 4: 重构 UI 中的 RefreshView 逻辑

并行查询频道数，并拦截设置页的无意义查询。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    // 获取当前服务器的频道列表和统计信息
    const channelList = await dataAdapter.getChannels(currentServer);
    const channelCounts = {};
    for (const ch of channelList) {
      // 临时：为了 Phase 1 快速实现，我们这里可能需要优化
      // 现在的 getMessages 返回 total，我们或许需要一个独立的 getChannelStats
      // 这里的实现依赖 getMessages 的开销，如果是全量内存没问题，如果是 DB 可能会慢
      // 暂时先用 dummy 或者让 renderer 自己处理？
      // Renderer 需要显示 "Global (500)"。
      // 让我们假设 inMemoryState 依然很快。
      const { total } = await dataAdapter.getMessages(currentServer, ch, 1, 1);
      channelCounts[ch] = total;
    }

    // 确定当前选中的 Channel
    let selectedChannel = stateChannel;

    // 如果未选择或列表变动导致原选择失效，修正它并同步回 uiState
    if (!selectedChannel && channelList.length > 0) {
      selectedChannel = channelList[0];
      uiState.setSelectedChannel(selectedChannel);
    } else if (selectedChannel && !channelList.includes(selectedChannel)) {
      selectedChannel = channelList[0];
      uiState.setSelectedChannel(selectedChannel);
    }

    // 获取消息数据
    let messages = [];
    let totalCount = 0;

    if (currentServer && selectedChannel) {
      // 如果是 stats 模式，可能需要全量数据 (Phase 1 临时兼容)
      const fetchSize = viewMode === 'stats' ? 999999 : pageSize;
      const fetchPage = viewMode === 'stats' ? 1 : currentPage;

      const result = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        fetchPage,
        fetchSize,
      );
      messages = result.messages;
      totalCount = result.total;
    }

    // 更新分页状态
    const newTotalPages = Math.ceil(totalCount / pageSize);
    uiState.setTotalPages(newTotalPages);
~~~~~
~~~~~javascript.new
    // 获取当前服务器的频道列表和统计信息
    const channelList = await dataAdapter.getChannels(currentServer);
    const channelCounts = {};
    
    // 使用 Promise.all 并行获取各个频道的总数，极大提升刷新速度
    await Promise.all(
      channelList.map(async (ch) => {
        channelCounts[ch] = await dataAdapter.getChannelCount(currentServer, ch);
      })
    );

    // 确定当前选中的 Channel
    let selectedChannel = stateChannel;

    // 如果未选择或列表变动导致原选择失效，修正它并同步回 uiState
    if (!selectedChannel && channelList.length > 0) {
      selectedChannel = channelList[0];
      uiState.setSelectedChannel(selectedChannel);
    } else if (selectedChannel && !channelList.includes(selectedChannel)) {
      selectedChannel = channelList[0];
      uiState.setSelectedChannel(selectedChannel);
    }

    // 获取消息数据
    let messages = [];
    let totalCount = selectedChannel ? (channelCounts[selectedChannel] || 0) : 0;

    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      // 如果是 stats 模式，可能需要全量数据 (Phase 1 临时兼容)
      const fetchSize = viewMode === 'stats' ? 999999 : pageSize;
      const fetchPage = viewMode === 'stats' ? 1 : currentPage;

      const result = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        fetchPage,
        fetchSize,
      );
      messages = result.messages;
      totalCount = result.total; // 确保一致性
    }

    // 更新分页状态
    const newTotalPages = Math.ceil(totalCount / pageSize);
    uiState.setTotalPages(newTotalPages);
~~~~~

### 下一步建议
以上代码已经修改完毕。我们可以生成提交计划，现在 UI 操作的大部分卡顿都应该消失了。你也可以去设置页面实际验证一下切换体验是否得到了显著的改善。
