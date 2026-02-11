import { IndexedDBAdapter } from './indexed-db.adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';

/**
 * Manages the storage backend for the application.
 * It holds an instance of a storage adapter, decides which adapter to use,
 * and exposes its methods.
 */
class StorageManager {
  /** @type {IStorageAdapter} */
  adapter;

  /**
   * Initializes the storage manager, selecting the best available adapter.
   */
  async init() {
    // For now, we'll default to IndexedDB.
    // In the migration step, we will add logic here to check compatibility
    // and decide which adapter to instantiate.
    this.adapter = new IndexedDBAdapter();
    await this.adapter.init();
  }

  // --- Delegate all methods to the adapter ---

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

  // --- Legacy accessors for migration ---

  getLegacyAdapters() {
    return {
      localStorage: new LocalStorageAdapter(),
    };
  }
}

// Export a singleton instance
export const storageManager = new StorageManager();
