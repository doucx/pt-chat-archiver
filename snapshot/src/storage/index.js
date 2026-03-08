import { MigrationManager } from '../migrations.js';
import { IndexedDBAdapter } from './indexed-db-adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';

/**
 * Manages the storage backend for the application.
 * It holds an instance of a storage adapter and exposes its methods.
 * This abstracts the storage implementation from the rest of the app.
 */
class StorageManager {
  adapter;

  constructor() {
    this.adapter = null;
  }

  /**
   * Initializes the storage subsystem.
   * This determines which adapter to use and initializes it.
   * @param {boolean} useIndexedDB - Force use of IndexedDB (for testing or future default).
   */
  async init(useIndexedDB = false) {
    // 如果已经初始化过且没有强制切换，则直接返回
    if (this.adapter && !useIndexedDB) return;

    if (useIndexedDB) {
      const targetAdapter = new IndexedDBAdapter();
      await targetAdapter.init();

      // --- 迁移逻辑集成 ---
      // 在正式切换到 IndexedDB 之前，检查是否需要迁移
      // 我们创建一个临时的 LocalStorageAdapter 来读取旧数据
      const sourceAdapter = new LocalStorageAdapter();
      // LocalStorageAdapter 不需要 await init() 因为它是同步模拟的，但为了接口一致性...
      await sourceAdapter.init();

      await MigrationManager.runSilentMigrations(sourceAdapter, targetAdapter);

      this.adapter = targetAdapter;
    } else {
      this.adapter = new LocalStorageAdapter();
      await this.adapter.init();
    }

    console.info(`[StorageManager] Initialized with ${this.adapter.constructor.name}`);
  }

  putMessage(msg) {
    if (this.adapter?.putMessage) return this.adapter.putMessage(msg);
    return Promise.resolve();
  }

  putMessages(msgs) {
    if (this.adapter?.putMessages) return this.adapter.putMessages(msgs);
    return Promise.resolve();
  }

  getServers() {
    if (this.adapter?.getServers) return this.adapter.getServers();
    return Promise.resolve([]);
  }

  getChannels(server) {
    if (this.adapter?.getChannels) return this.adapter.getChannels(server);
    return Promise.resolve([]);
  }

  getMessages(server, channel, page, pageSize) {
    if (this.adapter?.getMessages) return this.adapter.getMessages(server, channel, page, pageSize);
    return Promise.resolve({ messages: [], total: 0 });
  }

  getLatestMessages(server, channel, limit) {
    if (this.adapter?.getLatestMessages) return this.adapter.getLatestMessages(server, channel, limit);
    return Promise.resolve([]);
  }

  loadAllV6() {
    return this.adapter.loadAllV6();
  }

  saveAllV6(state) {
    return this.adapter.saveAllV6(state);
  }

  getConfig() {
    return this.adapter.getConfig();
  }

  saveConfig(config) {
    return this.adapter.saveConfig(config);
  }

  getSelfName() {
    return this.adapter.getSelfName();
  }

  setSelfName(name) {
    return this.adapter.setSelfName(name);
  }

  clearAllData() {
    return this.adapter.clearAllData();
  }

  getRawSize() {
    return this.adapter.getRawSize();
  }

  getTotalMessageCount() {
    if (this.adapter?.getTotalMessageCount) {
      return this.adapter.getTotalMessageCount();
    }
    return Promise.resolve(0);
  }

  hasV6Backup() {
    // 只有 LocalStorageAdapter 有此方法，这里需要判断
    const ls = new LocalStorageAdapter();
    return ls.hasV6Backup();
  }

  deleteV6Backup() {
    const ls = new LocalStorageAdapter();
    return ls.deleteV6Backup();
  }

  loadAllV4() {
    return this.adapter.loadAllV4();
  }

  removeV4Data() {
    return this.adapter.removeV4Data();
  }

  loadAllV5() {
    return this.adapter.loadAllV5();
  }

  removeV5Data() {
    return this.adapter.removeV5Data();
  }
}

// Export a singleton instance
export const storageManager = new StorageManager();

/**
 * 计算存储占用空间（辅助函数）。
 * @returns {Promise<number>} - 占用的空间大小，单位是 MB。
 */
export async function getStorageUsageInMB() {
  const sizeInBytes = await storageManager.getRawSize();
  return sizeInBytes / (1024 * 1024);
}
