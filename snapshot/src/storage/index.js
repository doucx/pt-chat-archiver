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
    // 策略：如果明确要求使用 IDB，或者未来通过配置决定
    if (useIndexedDB) {
      this.adapter = new IndexedDBAdapter();
    } else {
      // 默认回退到 LocalStorage (当前阶段)
      this.adapter = new LocalStorageAdapter();
    }
    
    await this.adapter.init();
    console.info(`[StorageManager] Initialized with ${this.adapter.constructor.name}`);
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
