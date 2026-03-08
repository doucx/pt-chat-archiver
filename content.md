这是一个非常精彩且深入的反馈！你的观察帮我们定位到了系统架构底层最隐蔽的几个逻辑死角。

我分析了导致这些现象的根本原因：

1. **为什么隐藏呼出面板依然会导致重复？**
   在原有的代码中，每当聊天框被 `display: none` 隐藏时，脚本就会注销监听器（`deactivateLogger`），当再次显示时重新激活并强制进行一次全量 DOM 扫描。在手机端，DOM 并没有被卸载，这导致了大量无意义的重载。
2. **为什么会陷入无限重复并伴随警告？**
   这是一个由三个巧合组成的致命 Bug：
   - 当 DOM 扫描与数据库记录发生错位（例如频道切换瞬间）时，算法会插入一个 `[警告 - 此处可能存在记录丢失]` 标记。
   - 致命的是，**这个系统生成的警告标记没有被赋予 `id` 属性**！
   - 在执行时间戳挤压（`ensureIdMonotonicity`）时，由于上一条消息没有 `id`，单调性检查被直接跳过。导致后面的重复消息保留了它们旧的时间戳。
   - 当存入 IndexedDB 时，它们因为时间戳较旧，被排到了数据库较靠前的位置。下次查询最新的 200 条记录时，它们“逃脱”了查询窗口，导致算法认为它们不存在于数据库中，从而**再次从 DOM 中追加它们**。这就形成了无限复制的死循环。
3. **为什么 UI 会卡顿几秒？**
   每次有新消息到来时，UI 都会要求重新渲染。而在渲染前，它会请求数据库中所有的 `Servers` 和 `Channels` 列表。由于 IndexedDB 中我们使用了 `nextunique` 游标去扫描整个数据库的消息表来提取唯一频道名，当你有几千条消息时，这个操作会变得极其缓慢，直接导致 UI 线程阻塞。

为 `IndexedDBAdapter` 引入内存缓存层彻底消除卡顿，修复 ID 缺失导致的无限重复循环，并调整 UI 观察者以保持后台静默监听。

## [WIP] fix: 修复重叠算法漏洞与 UI 严重卡顿问题

### 错误分析

1. **缓存缺失导致的性能瓶颈**: `getServers` 和 `getChannels` 方法在每次新消息到达触发 UI 更新时，都会使用 `nextunique` 游标全表扫描 IndexedDB，复杂度随消息数量线性增长，导致严重的 UI 阻塞（几秒的延迟）。
2. **监听器生命周期缺陷**: `uiObserver` 在检测到聊天框 `display: none` 时会断开观察者，重新显示时又触发全量的重扫描，既浪费性能又增加竞争风险。
3. **主键缺失引发的时间线崩坏**: `mergeAndDeduplicateMessages` 中生成的系统警告节点缺乏 `id`。这破坏了 `ensureIdMonotonicity` 的单调性校验，导致后续错误追加的重复记录时间戳倒流。它们因时间戳较旧而跌出 `getLatestMessages(200)` 的查询窗口，进而在下一次扫描时被反复认定为“新数据”，引发无限克隆。

### 用户需求

解决新消息到达时 UI 响应卡顿数秒的问题，并彻底根除频繁隐藏/显示聊天框导致的聊天记录无限克隆与错误对齐。

### 评论

这是一个兼具性能优化与严重逻辑修复的里程碑更新。内存缓存的引入将使消息插入和 UI 更新的性能呈指数级跃升，而对监听器生命周期的正确管理不仅省电、流畅，还从根源上避开了非必要的重扫描。

### 目标

1. 在 `IndexedDBAdapter` 中引入内存级别的 `cache`，缓存 `servers` 和 `channels`，在增删改时自动维护。
2. 修改 `uiObserver`，使其在容器被隐藏 (`display: none`) 时保持后台静默监听，仅在元素彻底销毁时注销。
3. 在 `ensureIdMonotonicity` 中添加后备机制，为任何缺失 `id` 的消息（包括警告标记）即时生成主键，确保时间线推挤算法严密运行。

### 基本原理

通过缓存消除 O(N) 级别的全表游标扫描，将每次更新的开销降至 O(1)。允许 MutationObserver 在隐藏状态下继续收集增量消息，不仅保证了数据的连续性，还彻底免除了每次呼出聊天框都要重扫 DOM 的灾难性操作。

### 标签

#intent/fix #flow/ready #priority/critical #comp/runtime #concept/state #concept/ui #scope/core #scope/perf #ai/delegate #task/domain/sync #task/object/history-merger #task/action/fix #task/state/end

---

### Script

#### Acts 1: 引入 IndexedDB 内存缓存层并优化读写

为 `IndexedDBAdapter` 添加 `cache` 属性，并在读、写、清除操作时自动维护它，从而消除每次新消息导致的卡顿。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
export class IndexedDBAdapter {
  constructor() {
    this.db = null;
  }

  /**
~~~~~
~~~~~javascript
export class IndexedDBAdapter {
  constructor() {
    this.db = null;
    this.cache = {
      servers: null,
      channels: {}, // { serverName: [channel1, channel2] }
    };
  }

  /**
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
  putMessage(msg) {
    return new Promise((resolve, reject) => {
      if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.put(msg);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  putMessages(msgs) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const msg of msgs) {
        if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
        store.put(msg);
      }
    });
  }
~~~~~
~~~~~javascript
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
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.put(msg);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

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
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
  getServers() {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server');
      const req = index.openKeyCursor(null, 'nextunique');
      const servers = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          servers.push(cursor.key);
          cursor.continue();
        } else {
          resolve(servers);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  getChannels(server) {
    if (!server) return Promise.resolve([]);
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
          resolve(channels);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }
~~~~~
~~~~~javascript
  getServers() {
    if (this.cache.servers) return Promise.resolve([...this.cache.servers]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server');
      const req = index.openKeyCursor(null, 'nextunique');
      const servers = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          servers.push(cursor.key);
          cursor.continue();
        } else {
          this.cache.servers = servers;
          resolve([...servers]);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

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
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
  saveAllV6(state) {
    return new Promise((resolve, reject) => {
      const flatMessages = flattenV6State(state);
~~~~~
~~~~~javascript
  saveAllV6(state) {
    this.cache = { servers: null, channels: {} };
    return new Promise((resolve, reject) => {
      const flatMessages = flattenV6State(state);
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
  clearAllData() {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES, STORE_CONFIG], 'readwrite');
~~~~~
~~~~~javascript
  clearAllData() {
    this.cache = { servers: null, channels: {} };
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES, STORE_CONFIG], 'readwrite');
~~~~~

#### Acts 2: 修复时间线崩坏漏洞

修改 `state.js`，为警告节点生成 `id`，并保证任何进入 `ensureIdMonotonicity` 的消息都会被赋予 `id`，防止单调性检查被绕过。

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript
  if (discontinuityDetected && oldSigs.length > 0) {
    console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
    const discontinuityMark = {
      time: getISOTimestamp(),
      type: 'system',
      sender: 'Archiver',
      receiver: 'System',
      content: '[警告 - 此处可能存在记录丢失]',
      is_archiver: true,
    };
    return ensureIdMonotonicity(oldMessages.concat([discontinuityMark], messagesToAdd));
  }
~~~~~
~~~~~javascript
  if (discontinuityDetected && oldSigs.length > 0) {
    console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
    const markTime = getISOTimestamp();
    const discontinuityMark = {
      id: generateULID(new Date(markTime).getTime()),
      time: markTime,
      type: 'system',
      sender: 'Archiver',
      receiver: 'System',
      content: '[警告 - 此处可能存在记录丢失]',
      is_archiver: true,
    };
    return ensureIdMonotonicity(oldMessages.concat([discontinuityMark], messagesToAdd));
  }
~~~~~

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript
function ensureIdMonotonicity(messages) {
  if (!messages || messages.length === 0) return messages;

  let lastId = null;
  // let fixedCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // 简单的字符串字典序比较
    if (lastId && msg.id < lastId) {
~~~~~
~~~~~javascript
function ensureIdMonotonicity(messages) {
  if (!messages || messages.length === 0) return messages;

  let lastId = null;
  // let fixedCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (!msg.id) {
      msg.id = generateULID(new Date(msg.time).getTime());
    }

    // 简单的字符串字典序比较
    if (lastId && msg.id < lastId) {
~~~~~

#### Acts 3: 调整 UI 观察者以保持静默监听

修改 `main.js`，避免仅因为 `display: none` 就断开消息监听，从而免除重新显示时的全量扫描和引发的合并故障。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript
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
~~~~~javascript
    const uiObserver = new MutationObserver(() => {
      const { chatLogContainer } = locateChatElements();
      if (chatLogContainer) {
        // 不再因为 display: none 而注销监听器。
        // 这确保了在手机端隐藏聊天框时，依然能在后台正常捕获新消息，
        // 并且避免了反复显示隐藏时触发大量无意义的 DOM 重扫描。
        if (!messageObserver) {
          activateLogger();
        }
      } else if (messageObserver) {
        // 只有当聊天容器彻底从 DOM 中被移除时，才注销监听。
        deactivateLogger();
      }
    });
~~~~~

### 下一步建议
现在你可以测试以下内容：
- **UI 响应速度**: 此时如果有新消息发送，UI 应该能即刻刷新，再也没有几秒钟的卡顿。
- **并发与重复扫描**: 你可以随意在移动端隐藏/呼出聊天框，不再会有任何消息被重复写入（因为它只会在后台安静地收集新消息了）。
- **清理旧垃圾**: 点击一次 `清理重复记录`，彻底与之前的 Bug 残留道别。
