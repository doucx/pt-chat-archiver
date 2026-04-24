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

  getChannelCount(server, channel) {
    if (this.adapter?.getChannelCount) return this.adapter.getChannelCount(server, channel);
    if (this.adapter?.getMessages)
      return this.adapter.getMessages(server, channel, 1, 1).then((r) => r.total);
    return Promise.resolve(0);
  }

  getMessages(server, channel, page, pageSize, onProgress, offsetOverride) {
    if (this.adapter?.getMessages)
      return this.adapter.getMessages(server, channel, page, pageSize, onProgress, offsetOverride);
    return Promise.resolve({ messages: [], total: 0 });
  }

  getMessagesChunk(server, channel, lastTime, limit) {
    if (this.adapter?.getMessagesChunk)
      return this.adapter.getMessagesChunk(server, channel, lastTime, limit);
    return Promise.resolve([]);
  }

  getLatestMessages(server, channel, limit) {
    if (this.adapter?.getLatestMessages)
      return this.adapter.getLatestMessages(server, channel, limit);
    return Promise.resolve([]);
  }

  deleteMessages(ids) {
    if (this.adapter?.deleteMessages) return this.adapter.deleteMessages(ids);
    return Promise.resolve();
  }

  exportFullArchive() {
    return this.adapter.exportFullArchive();
  }

  overwriteFullArchive(state) {
    return this.adapter.overwriteFullArchive(state);
  }

  mergeFullArchive(state) {
    return this.adapter.mergeFullArchive(state);
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

  getLastServer() {
    return this.adapter.getLastServer();
  }

  setLastServer(name) {
    return this.adapter.setLastServer(name);
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

  removeV4Data() {
    return Promise.resolve();
  }

  removeV5Data() {
    return Promise.resolve();
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
