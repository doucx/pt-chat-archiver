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

  async getServers() {
    if (this.cache.servers) return [...this.cache.servers];
    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
    const index = store.index('server');
    const servers = [];

    await new Promise((resolve, reject) => {
      const req = index.openKeyCursor(null, 'nextunique');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          servers.push(cursor.key);
          cursor.continue();
        } else {
          this.cache.servers = servers;
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
    return [...servers];
  }

  async getChannels(server) {
    if (!server) return [];
    if (this.cache.channels[server]) return [...this.cache.channels[server]];
    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
    const index = store.index('server_channel');
    const range = IDBKeyRange.bound([server, ''], [server, '\uffff']);
    const channels = [];

    await new Promise((resolve, reject) => {
      const req = index.openKeyCursor(range, 'nextunique');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          channels.push(cursor.key[1]);
          cursor.continue();
        } else {
          this.cache.channels[server] = channels;
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
    return [...channels];
  }

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

  async getMessages(server, channel, page, pageSize, onProgress, offsetOverride) {
    if (!server || !channel) return { messages: [], total: 0 };
    const total = await this.getChannelCount(server, channel);
    const messages = [];
    const start = offsetOverride !== undefined ? offsetOverride : (page - 1) * pageSize;

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
    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
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

    return this._req(index.getAll(range, limit));
  }

  async getLatestMessages(server, channel, limit) {
    if (!server || !channel) return [];
    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
    const index = store.index('server_channel_time');
    const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
    const messages = [];

    return new Promise((resolve, reject) => {
      const cursorReq = index.openCursor(range, 'prev');
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          messages.unshift(cursor.value);
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
  async getTotalMessageCount() {
    try {
      const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
      return await this._req(store.count());
    } catch (e) {
      return 0;
    }
  }
}
