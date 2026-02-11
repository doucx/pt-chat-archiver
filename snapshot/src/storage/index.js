import { IndexedDBAdapter } from './indexed-db-adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
// 避免循环依赖，我们将在 init 方法内部动态导入 MigrationManager，或者将其作为依赖注入
// 但由于 MigrationManager 是单例对象，直接导入通常也可行，只要小心循环引用
// 这里我们假设 main.js 会协调这一过程，或者在这里动态导入

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

      // 动态导入以避免潜在的循环依赖问题 (storage/index.js <-> migrations.js)
      const { MigrationManager } = await import('../migrations.js');
      await MigrationManager.runSilentMigrations(sourceAdapter, targetAdapter);

      this.adapter = targetAdapter;
    } else {
      this.adapter = new LocalStorageAdapter();
      await this.adapter.init();
    }

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
