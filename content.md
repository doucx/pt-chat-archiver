这是一个非常明智的优化切入点。通过实现元数据缓存（Metadata Caching），我们可以将 `refreshView` 中原本 $O(N)$（$N$ 为频道数量）的数据库查询开销降低到近乎 $O(1)$。

我将通过以下方案实施：在 `IndexedDBAdapter` 中引入一个 `counts` 缓存，在数据库初始化或首次访问时按需加载，并在消息写入（增量）和删除（失效）时自动同步。

## [WIP] perf: 为 IndexedDB 适配器引入频道消息计数内存缓存

### 用户需求
消除切换页面、设置和统计视图时的明显延迟，特别是在频道数量较多或单页数据量大的情况下。

### 评论
当前的 `refreshView` 逻辑在每次 UI 更新时都会并发查询所有频道的 `count()`。虽然 IndexedDB 的索引查询很快，但在高频交互（如点击分页）时，这种重复的 I/O 累积会导致明显的掉帧。内存缓存是解决此类“读多写少”元数据瓶颈的标准手段。

### 目标
1.  在 `IndexedDBAdapter` 中建立 `this.cache.counts` 结构。
2.  实现 `getChannelCount` 的“先缓存后数据库”逻辑。
3.  确保 `putMessage` 和 `putMessages` 能够实时增加缓存计数。
4.  确保 `deleteMessages` 和 `clearAllData` 能够正确失效或重置缓存计数。

### 基本原理
我们在适配器内部维护一个字典 `{ [serverName]: { [channelName]: count } }`。
- **读取**：如果缓存中存在值，直接返回，避免数据库事务。
- **写入**：由于我们已经知道消息所属的服务器和频道，直接对缓存值进行 `+1`。
- **删除**：由于 `deleteMessages` 仅接收 ID 列表，为了保证数据一致性而不进行额外的反查，我们在删除操作完成后将对应的计数缓存设为 `undefined`，触发下次访问时的重新同步。

### 标签
#intent/refine #flow/ready #priority/high #comp/engine #concept/state #scope/core #scope/dx #ai/delegate #task/domain/storage #task/object/metadata-cache #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 升级 `IndexedDBAdapter` 增加计数缓存逻辑

我们将修改 `IndexedDBAdapter` 的构造函数、写入方法和计数方法。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  constructor() {
    this.db = null;
    this.cache = {
      servers: null,
      channels: {}, // { serverName: [channel1, channel2] }
    };
  }
~~~~~
~~~~~javascript.new
  constructor() {
    this.db = null;
    this.cache = {
      servers: null,
      channels: {}, // { serverName: [channel1, channel2] }
      counts: {}, // { serverName: { channelName: number } }
    };
  }
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  _updateCache(msg) {
    if (this.cache.servers && !this.cache.servers.includes(msg.server)) {
      this.cache.servers.push(msg.server);
    }
    if (msg.server && msg.channel) {
      if (!this.cache.channels[msg.server]) {
        this.cache.channels[msg.server] = [];
      }
      if (!this.cache.channels[msg.server].includes(msg.channel)) {
        this.cache.channels[msg.server].push(msg.channel);
      }
    }
  }

  putMessage(msg) {
    return new Promise((resolve, reject) => {
      if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
      this._updateCache(msg);
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
~~~~~
~~~~~javascript.new
  _updateCache(msg, countDelta = 0) {
    if (this.cache.servers && !this.cache.servers.includes(msg.server)) {
      this.cache.servers.push(msg.server);
    }
    if (msg.server && msg.channel) {
      // 1. 更新频道列表缓存
      if (!this.cache.channels[msg.server]) {
        this.cache.channels[msg.server] = [];
      }
      if (!this.cache.channels[msg.server].includes(msg.channel)) {
        this.cache.channels[msg.server].push(msg.channel);
      }
      // 2. 更新计数缓存 (增量)
      if (!this.cache.counts[msg.server]) {
        this.cache.counts[msg.server] = {};
      }
      if (this.cache.counts[msg.server][msg.channel] !== undefined) {
        this.cache.counts[msg.server][msg.channel] += countDelta;
      }
    }
  }

  putMessage(msg) {
    return new Promise((resolve, reject) => {
      if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
      this._updateCache(msg, 1);
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  putMessages(msgs) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const msg of msgs) {
        if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
        this._updateCache(msg);
        store.put(msg);
      }
    });
  }

  deleteMessages(ids) {
    if (!ids || ids.length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const id of ids) {
        store.delete(id);
      }
    });
  }
~~~~~
~~~~~javascript.new
  putMessages(msgs) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const msg of msgs) {
        if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
        this._updateCache(msg, 1);
        store.put(msg);
      }
    });
  }

  deleteMessages(ids) {
    if (!ids || ids.length === 0) return Promise.resolve();
    // 删除后失效计数缓存，强制下次刷新时重算
    this.cache.counts = {};
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const id of ids) {
        store.delete(id);
      }
    });
  }
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
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
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  saveAllV6(state) {
    this.cache = { servers: null, channels: {} };
    return new Promise((resolve, reject) => {
~~~~~
~~~~~javascript.new
  saveAllV6(state) {
    this.cache = { servers: null, channels: {}, counts: {} };
    return new Promise((resolve, reject) => {
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  mergeAllV6(state) {
    this.cache = { servers: null, channels: {} };
    return new Promise((resolve, reject) => {
~~~~~
~~~~~javascript.new
  mergeAllV6(state) {
    this.cache = { servers: null, channels: {}, counts: {} };
    return new Promise((resolve, reject) => {
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  clearAllData() {
    this.cache = { servers: null, channels: {} };
    return new Promise((resolve, reject) => {
~~~~~
~~~~~javascript.new
  clearAllData() {
    this.cache = { servers: null, channels: {}, counts: {} };
    return new Promise((resolve, reject) => {
~~~~~

### 下一步建议
1.  **验证性能提升**：在开发者工具的 Timeline 中观察 `refreshView` 引起的 Scripting 耗时，理论上 `indexedDB.open` 的请求数量应大幅下降。
2.  **解耦配置视图逻辑**：目前 `refreshView` 在任何模式下都会拉取频道和计数。建议修改 `src/ui/index.js`，使 `refreshView` 在 `viewMode === 'config'` 时执行专门的精简渲染路径。
3.  **处理 PageSize 引起的渲染卡顿**：计数缓存解决了“加载前”的延迟，但 `textarea` 渲染 10000 条消息的卡顿依然存在。下一步可以考虑引入 Web Worker 进行消息格式化，或者实现简单的虚拟滚动（仅渲染可见区域）。
