import { DB_NAME, DB_VERSION, STORE_CONFIG, STORE_MESSAGES } from '../constants.js';
import { flattenV6State, nestV7Messages } from '../data/transformer.js';
import { generateULID } from '../utils.js';

/**
 * 基于 IndexedDB 的存储适配器。
 * 实现了数据的异步读写，并负责将扁平化的数据库记录转换为 UI 所需的嵌套结构。
 */
export class IndexedDBAdapter {
  constructor() {
    this.db = null;
    this.cache = {
      servers: null,
      channels: {}, // { serverName: [channel1, channel2] }
      counts: {}, // { serverName: { channelName: number } }
    };
  }

  /**
   * 打开数据库连接并处理 Schema 升级。
   */
  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('[IndexedDB] Open error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        let msgStore;
        // 创建消息存储 Store
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
          msgStore.createIndex('server', 'server', { unique: false });
          msgStore.createIndex('channel', 'channel', { unique: false });
          msgStore.createIndex('time', 'time', { unique: false });
        } else {
          msgStore = event.target.transaction.objectStore(STORE_MESSAGES);
        }

        // V2 新增复合索引
        if (!msgStore.indexNames.contains('server_channel')) {
          msgStore.createIndex('server_channel', ['server', 'channel'], { unique: false });
        }
        if (!msgStore.indexNames.contains('server_channel_time')) {
          msgStore.createIndex('server_channel_time', ['server', 'channel', 'time'], {
            unique: false,
          });
        }

        // 创建配置存储 Store
        if (!db.objectStoreNames.contains(STORE_CONFIG)) {
          db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
        }
      };
    });
  }

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

  getMessages(server, channel, page, pageSize, onProgress) {
    if (!server || !channel) return Promise.resolve({ messages: [], total: 0 });
    return new Promise(async (resolve, reject) => {
      try {
        const total = await this.getChannelCount(server, channel);
        const messages = [];
        const start = (page - 1) * pageSize;

        if (start >= total || total === 0) {
          return resolve({ messages, total });
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
          const result = await this._getMessagesSingleTx(server, channel, advanceCount, pageSize, direction, total, reverse);
          return resolve(result);
        }

        // 分块读取以支持进度汇报，避免长时间阻塞主线程
        const chunkSize = 250;
        const totalToFetch = Math.min(pageSize, total - start);
        let currentSkip = advanceCount;

        while (messages.length < totalToFetch) {
          const limit = Math.min(chunkSize, totalToFetch - messages.length);
          const chunkResult = await this._getMessagesSingleTx(server, channel, currentSkip, limit, direction, total, false);
          
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

        resolve({ messages, total });
      } catch (err) {
        reject(err);
      }
    });
  }

  _getMessagesSingleTx(server, channel, advanceCount, limit, direction, total, reverseResult) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
      
      const cursorReq = index.openCursor(range, direction);
      let advanced = false;
      const messages = [];
      
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          if (reverseResult) messages.reverse();
          return resolve({ messages, total });
        }
        if (advanceCount > 0 && !advanced) {
          advanced = true;
          cursor.advance(advanceCount);
        } else {
          messages.push(cursor.value);
          if (messages.length < limit) {
            cursor.continue();
          } else {
            if (reverseResult) messages.reverse();
            resolve({ messages, total });
          }
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

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

  getLatestMessages(server, channel, limit) {
    if (!server || !channel) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);

      const cursorReq = index.openCursor(range, 'prev');
      const messages = [];

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          messages.unshift(cursor.value); // 加入队首以保持升序
          if (messages.length < limit) {
            cursor.continue();
          } else {
            resolve(messages);
          }
        } else {
          resolve(messages);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

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

  /**
   * 获取配置
   */
  getConfig() {
    const defaultCfg = { pageSize: 1000, initDebounceMs: 150 };
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

  /**
   * 清除所有数据
   */
  clearAllData() {
    this.cache = { servers: null, channels: {}, counts: {} };
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES, STORE_CONFIG], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      tx.objectStore(STORE_MESSAGES).clear();
      // 配置通常保留，或者根据需求清除。这里只清除消息是比较安全的做法。
      // 但为了符合 "Clear All Data" 的语义，我们通常也会重置状态。
      // 为保持行为一致，这里暂不清除配置，只清除消息。
    });
  }

  /**
   * 获取估算的存储大小 (字节)
   * 通过消息总数进行 O(1) 估算，避免在数据量大时 getAll 导致内存溢出。
   */
  async getRawSize() {
    const count = await this.getTotalMessageCount();
    // 假设每条消息平均占用 150 字节的存储空间
    const estimatedSize = count * 150;
    return estimatedSize;
  }

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

  // --- Legacy Support ---
  loadAllV4() {
    return Promise.resolve(null);
  }
  removeV4Data() {
    return Promise.resolve();
  }
  loadAllV5() {
    return Promise.resolve(null);
  }
  removeV5Data() {
    return Promise.resolve();
  }
}
