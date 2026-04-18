我将对 `IndexedDBAdapter` 进行重构，引入中央 Promise 请求包装器 `_req` 和事务监听器 `_txDone`，以大幅消除回调地狱（样板代码）并统一错误处理逻辑。随后，我将重写 `tests/storage/indexed-db.test.js`，通过构建更完整的 IDB Mock 来验证核心的增删改查逻辑，从而将存储层的测试覆盖率从极低水平提升至可靠状态。

## [WIP] refactor(storage): 提取 IDB 请求包装器并完善单元测试

### 用户需求
1.  在 `indexed-db-adapter.js` 中提取 `executeRequest`（在类中实现为私有辅助函数 `_req`）以简化异步代码。
2.  大幅提升 `indexed-db-adapter.js` 的测试覆盖率。

### 评论
存储层是应用最核心的资产。目前的 `IndexedDBAdapter` 实现虽然功能完整，但代码结构过于原始（Promise 样板代码过多），且由于缺乏有效 Mock，测试覆盖率处于危险的低位（18%）。本次重构将从代码质量和质量保证两个维度进行加固。

### 目标
1.  实现 `_req` 和 `_txDone` 辅助函数。
2.  将类中所有使用 `new Promise` 手动包装的 IDB 调用迁移到辅助函数。
3.  重构 `tests/storage/indexed-db.test.js`，实现对 `putMessage`, `getServers`, `deleteMessages` 等核心 API 的逻辑验证。

### 基本原理
通过将 `IDBRequest` 的 `onsuccess/onerror` 模式抽象为通用的 `_req(request)` 辅助函数，我们可以将原本 8-10 行的代码缩减为 1 行，同时确保错误处理的一致性。对于多步操作的事务，引入 `_txDone(tx)` 来监听事务整体的完成。在测试方面，通过 Vitest 的 Spy 功能模拟 IDB 事务链，可以在不依赖真实浏览器的情况下验证适配器的行为逻辑。

### 标签
#intent/refine #flow/ready #priority/high #comp/runtime #concept/state #ai/delegate #task/domain/storage #task/object/indexed-db-adapter #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 重构 `IndexedDBAdapter` 引入辅助函数并精简代码

我将首先定义 `_req` 和 `_txDone`，然后重写该类中所有的存储操作方法。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  putMessage(msg) {
    return new Promise((resolve, reject) => {
      if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
      this._updateCache(msg, 1);
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
~~~~~javascript.new
  putMessage(msg) {
    if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
    this._updateCache(msg, 1);
    const store = this._tx([STORE_MESSAGES], 'readwrite').objectStore(STORE_MESSAGES);
    return this._req(store.put(msg));
  }

  putMessages(msgs) {
    const tx = this._tx([STORE_MESSAGES], 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    for (const msg of msgs) {
      if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
      this._updateCache(msg, 1);
      store.put(msg);
    }
    return this._txDone(tx);
  }

  deleteMessages(ids) {
    if (!ids || ids.length === 0) return Promise.resolve();
    this.cache.counts = {};
    const tx = this._tx([STORE_MESSAGES], 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    for (const id of ids) {
      store.delete(id);
    }
    return this._txDone(tx);
  }
~~~~~

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
~~~~~
~~~~~javascript.new
  async getChannelCount(server, channel) {
    if (!server || !channel) return 0;
    if (this.cache.counts[server] && this.cache.counts[server][channel] !== undefined) {
      return this.cache.counts[server][channel];
    }

    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
    const index = store.index('server_channel_time');
    const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
    const count = await this._req(index.count(range));

    if (!this.cache.counts[server]) this.cache.counts[server] = {};
    this.cache.counts[server][channel] = count;
    return count;
  }
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  getMessagesChunk(server, channel, lastTime, limit = 2000) {
    if (!server || !channel) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');

      let range;
      if (lastTime) {
        range = IDBKeyRange.bound(
          [server, channel, lastTime],
          [server, channel, '\uffff'],
          true,
          false,
        );
      } else {
        range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
      }

      const request = index.getAll(range, limit);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
~~~~~
~~~~~javascript.new
  getMessagesChunk(server, channel, lastTime, limit = 2000) {
    if (!server || !channel) return Promise.resolve([]);
    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
    const index = store.index('server_channel_time');

    let range;
    if (lastTime) {
      range = IDBKeyRange.bound([server, channel, lastTime], [server, channel, '\uffff'], true, false);
    } else {
      range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
    }

    return this._req(index.getAll(range, limit));
  }
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  /**
   * 辅助方法：开启事务
   */
  _tx(storeNames, mode) {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.transaction(storeNames, mode);
  }

  /**
   * 读取所有消息并组装为 V6 嵌套结构。
   */
  loadAllV6() {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.getAll();

      request.onsuccess = () => {
        const flatMessages = request.result;
        const v6State = nestV7Messages(flatMessages);
        resolve(v6State);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存完整的 V6 状态。
   * 目前采用全量清理 + 全量写入的策略以保证一致性 (未来可优化为差异更新)。
   */
  saveAllV6(state) {
    this.cache = { servers: null, channels: {}, counts: {} };
    return new Promise((resolve, reject) => {
      const flatMessages = flattenV6State(state);
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      // 1. 清空当前存储 (简单粗暴但安全的一致性策略)
      const clearReq = store.clear();

      clearReq.onsuccess = () => {
        // 2. 批量写入
        for (const msg of flatMessages) {
          // 确保每条消息都有 ID
          if (!msg.id) {
            msg.id = generateULID(new Date(msg.time).getTime());
          }
          store.put(msg);
        }
      };
    });
  }

  /**
   * 合并 V6 状态到当前数据库。
   * 不执行清理，利用 ID 主键自动去重。
   */
  mergeAllV6(state) {
    this.cache = { servers: null, channels: {}, counts: {} };
    return new Promise((resolve, reject) => {
      const flatMessages = flattenV6State(state);
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      for (const msg of flatMessages) {
        if (!msg.id) {
          msg.id = generateULID(new Date(msg.time).getTime());
        }
        store.put(msg);
      }
    });
  }
~~~~~
~~~~~javascript.new
  /**
   * 辅助方法：开启事务
   */
  _tx(storeNames, mode) {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.transaction(storeNames, mode);
  }

  /**
   * 包装 IDBRequest 为 Promise
   */
  _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 监听事务完成
   */
  _txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * 读取所有消息并组装为 V6 嵌套结构。
   */
  async loadAllV6() {
    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
    const flatMessages = await this._req(store.getAll());
    return nestV7Messages(flatMessages);
  }

  /**
   * 保存完整的 V6 状态。
   * 目前采用全量清理 + 全量写入的策略以保证一致性 (未来可优化为差异更新)。
   */
  async saveAllV6(state) {
    this.cache = { servers: null, channels: {}, counts: {} };
    const flatMessages = flattenV6State(state);
    const tx = this._tx([STORE_MESSAGES], 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);

    await this._req(store.clear());
    for (const msg of flatMessages) {
      if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
      store.put(msg);
    }
    return this._txDone(tx);
  }

  /**
   * 合并 V6 状态到当前数据库。
   * 不执行清理，利用 ID 主键自动去重。
   */
  mergeAllV6(state) {
    this.cache = { servers: null, channels: {}, counts: {} };
    const flatMessages = flattenV6State(state);
    const tx = this._tx([STORE_MESSAGES], 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);

    for (const msg of flatMessages) {
      if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
      store.put(msg);
    }
    return this._txDone(tx);
  }
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  /**
   * 获取配置
   */
  getConfig() {
    const defaultCfg = {
      pageSize: 1000,
      statsLimit: 5000,
      readChunkSize: 250,
      initDebounceMs: 150,
      cachePages: 5,
    };
    return new Promise((resolve) => {
      const tx = this._tx([STORE_CONFIG], 'readonly');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.get('main_config');

      request.onsuccess = () => {
        resolve(request.result ? { ...defaultCfg, ...request.result.value } : defaultCfg);
      };
      request.onerror = () => {
        resolve(defaultCfg); // 出错降级使用默认值
      };
    });
  }

  /**
   * 保存配置
   */
  saveConfig(config) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_CONFIG], 'readwrite');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.put({ key: 'main_config', value: config });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取自身昵称 (存储在 config store 的特殊 key 中)
   */
  getSelfName() {
    return new Promise((resolve) => {
      const tx = this._tx([STORE_CONFIG], 'readonly');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.get('self_name');
      request.onsuccess = () => resolve(request.result ? request.result.value : '');
      request.onerror = () => resolve('');
    });
  }

  setSelfName(name) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_CONFIG], 'readwrite');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.put({ key: 'self_name', value: name.trim() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  getLastServer() {
    return new Promise((resolve) => {
      const tx = this._tx([STORE_CONFIG], 'readonly');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.get('last_server');
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => resolve(null);
    });
  }

  setLastServer(name) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_CONFIG], 'readwrite');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.put({ key: 'last_server', value: name });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
~~~~~
~~~~~javascript.new
  /**
   * 获取配置
   */
  async getConfig() {
    const defaultCfg = {
      pageSize: 1000,
      statsLimit: 5000,
      readChunkSize: 250,
      initDebounceMs: 150,
      cachePages: 5,
    };
    try {
      const store = this._tx([STORE_CONFIG], 'readonly').objectStore(STORE_CONFIG);
      const result = await this._req(store.get('main_config'));
      return result ? { ...defaultCfg, ...result.value } : defaultCfg;
    } catch (e) {
      return defaultCfg;
    }
  }

  /**
   * 保存配置
   */
  saveConfig(config) {
    const store = this._tx([STORE_CONFIG], 'readwrite').objectStore(STORE_CONFIG);
    return this._req(store.put({ key: 'main_config', value: config }));
  }

  /**
   * 获取自身昵称 (存储在 config store 的特殊 key 中)
   */
  async getSelfName() {
    try {
      const store = this._tx([STORE_CONFIG], 'readonly').objectStore(STORE_CONFIG);
      const result = await this._req(store.get('self_name'));
      return result ? result.value : '';
    } catch (e) {
      return '';
    }
  }

  setSelfName(name) {
    const store = this._tx([STORE_CONFIG], 'readwrite').objectStore(STORE_CONFIG);
    return this._req(store.put({ key: 'self_name', value: name.trim() }));
  }

  async getLastServer() {
    try {
      const store = this._tx([STORE_CONFIG], 'readonly').objectStore(STORE_CONFIG);
      const result = await this._req(store.get('last_server'));
      return result ? result.value : null;
    } catch (e) {
      return null;
    }
  }

  setLastServer(name) {
    const store = this._tx([STORE_CONFIG], 'readwrite').objectStore(STORE_CONFIG);
    return this._req(store.put({ key: 'last_server', value: name }));
  }
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  /**
   * 获取数据库中存储的消息总条数。
   */
  getTotalMessageCount() {
    return new Promise((resolve) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  }
~~~~~
~~~~~javascript.new
  /**
   * 获取数据库中存储的消息总条数。
   */
  async getTotalMessageCount() {
    try {
      const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
      return await this._req(store.count());
    } catch (e) {
      return 0;
    }
  }
~~~~~

#### Acts 2: 完善 `IndexedDBAdapter` 的单元测试

我将通过构造一个功能更强的 IDB Mock 来验证适配器的核心逻辑。

~~~~~act
write_file
tests/storage/indexed-db.test.js
~~~~~
~~~~~javascript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, DB_VERSION, STORE_CONFIG, STORE_MESSAGES } from '../../src/constants.js';
import { IndexedDBAdapter } from '../../src/storage/indexed-db-adapter.js';

describe('IndexedDBAdapter Logic Tests', () => {
  let adapter;
  let mockDb;
  let mockTx;
  let mockStore;
  let mockIndex;

  beforeEach(() => {
    // 构造深层 Mock 链
    mockIndex = {
      count: vi.fn(),
      getAll: vi.fn(),
      openCursor: vi.fn(),
      openKeyCursor: vi.fn(),
    };

    mockStore = {
      put: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn(),
      count: vi.fn(),
      clear: vi.fn(),
      delete: vi.fn(),
      index: vi.fn(() => mockIndex),
    };

    mockTx = {
      objectStore: vi.fn(() => mockStore),
      oncomplete: null,
      onerror: null,
      onabort: null,
    };

    mockDb = {
      transaction: vi.fn(() => mockTx),
      objectStoreNames: { contains: vi.fn(() => true) },
      createObjectStore: vi.fn(),
      close: vi.fn(),
    };

    adapter = new IndexedDBAdapter();
    adapter.db = mockDb; // 手动注入 Mock DB
    vi.clearAllMocks();
  });

  describe('基础增删改查逻辑', () => {
    it('putMessage 应当调用 store.put 并更新缓存', async () => {
      const msg = { server: 'S1', channel: 'C1', content: 'hello', time: new Date().toISOString() };
      const mockReq = { onsuccess: null, onerror: null };
      mockStore.put.mockReturnValue(mockReq);

      const promise = adapter.putMessage(msg);
      mockReq.onsuccess({ target: { result: 'ok' } });
      await promise;

      expect(mockDb.transaction).toHaveBeenCalledWith([STORE_MESSAGES], 'readwrite');
      expect(mockStore.put).toHaveBeenCalledWith(expect.objectContaining({ content: 'hello' }));
      // 验证缓存是否更新
      const servers = await adapter.getServers();
      expect(servers).toContain('S1');
    });

    it('deleteMessages 应当在事务完成后 resolve', async () => {
      const ids = ['id1', 'id2'];
      const promise = adapter.deleteMessages(ids);

      expect(mockStore.delete).toHaveBeenCalledTimes(2);
      expect(adapter.cache.counts).toEqual({}); // 验证缓存失效

      mockTx.oncomplete(); // 模拟事务完成
      await promise;
    });

    it('getServers 应当优先使用缓存', async () => {
      adapter.cache.servers = ['CachedServer'];
      const servers = await adapter.getServers();
      expect(servers).toEqual(['CachedServer']);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('getTotalMessageCount 应当返回 count 请求的结果', async () => {
      const mockReq = { onsuccess: null };
      mockStore.count.mockReturnValue(mockReq);

      const promise = adapter.getTotalMessageCount();
      mockReq.onsuccess({ target: { result: 42 } });
      const count = await promise;

      expect(count).toBe(42);
    });
  });

  describe('配置管理逻辑', () => {
    it('getConfig 在数据库未命中时应当返回默认值', async () => {
      const mockReq = { onsuccess: null };
      mockStore.get.mockReturnValue(mockReq);

      const promise = adapter.getConfig();
      mockReq.onsuccess({ target: { result: null } });
      const config = await promise;

      expect(config.pageSize).toBe(1000);
      expect(config.statsLimit).toBe(5000);
    });

    it('saveConfig 应当将数据存入 STORE_CONFIG', async () => {
      const config = { pageSize: 50 };
      const mockReq = { onsuccess: null };
      mockStore.put.mockReturnValue(mockReq);

      const promise = adapter.saveConfig(config);
      mockReq.onsuccess({});
      await promise;

      expect(mockDb.transaction).toHaveBeenCalledWith([STORE_CONFIG], 'readwrite');
      expect(mockStore.put).toHaveBeenCalledWith({ key: 'main_config', value: config });
    });
  });
});
~~~~~

### 下一步建议
- **UI 逻辑迁移**: 建议将 `src/ui/index.js` 中的 `ViewCache` 逻辑提取到独立文件，并为其编写针对性的缓存命中率测试。
- **性能分析**: 目前 `getRawSize` 是基于 150 字节的硬编码估算，可以考虑实现一个采样函数，读取前 100 条记录计算真实的平均字节数，从而提供更准确的存储占用报告。
