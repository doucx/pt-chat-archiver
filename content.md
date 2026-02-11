好的，我们正式进入第三阶段的核心——实现 IndexedDB 适配器。这将是新架构的心脏，负责与浏览器数据库进行所有异步交互。

我将为你生成一个计划，该计划会创建一个功能完整的 `IndexedDBAdapter`。它将使用我们上一步创建的 `transformer` 来无缝地处理数据结构的转换，同时保持对 `IStorageAdapter` 接口的严格遵守。

## [WIP] feat: 实现 IndexedDB 存储适配器

### 用户需求
创建一个 `IndexedDBAdapter` 类，它实现了标准的异步存储接口 (`IStorageAdapter`)，负责处理所有与 IndexedDB 的交互，包括数据库初始化、版本升级、数据读写，并集成数据转换逻辑。

### 评论
这是整个 V7 架构升级中最具体、最关键的编码步骤。一个健壮的 IndexedDB 适配器将彻底解决 LocalStorage 的性能瓶颈和存储容量限制。通过将所有数据库操作封装在一个独立的、可替换的模块中，我们极大地提高了代码的可测试性和未来的可维护性。

### 目标
1.  创建 `src/storage/indexed-db.adapter.js` 文件。
2.  实现 `init()` 方法，负责打开数据库连接并在 `onupgradeneeded` 事件中创建 V7 的数据表（Object Store）和索引。
3.  实现 `loadAll()` 方法，从 IndexedDB 中读取所有扁平化的消息记录，并使用 `nestV7Messages` 将其转换为 UI 层兼容的嵌套对象。
4.  实现 `saveAll()` 方法，接收 UI 层的嵌套状态对象，使用 `flattenV6State` 将其展平，然后通过一个事务（Transaction）批量写入 IndexedDB。
5.  实现 `clearAllData()` 方法，以清空 `messages` 表。
6.  为保持接口统一，将配置相关的 `getConfig/saveConfig` 等方法暂时代理到 LocalStorage，但同样包裹在 Promise 中。

### 基本原理
我们将创建一个 `IndexedDBAdapter` 类来封装所有 IndexedDB 的原生 API 调用。通过将回调式的原生 API 转换为 Promise，我们可以为上层应用提供简洁的 `async/await` 调用方式。在 `onupgradeneeded` 回调中，我们会定义 `messages` 表，使用 `id` (ULID) 作为主键，并创建一个复合索引 `['server', 'channel']` 以便未来进行高效的按频道查询。`saveAll` 将采用“先清空后批量写入”的策略，这对于全量保存操作来说是最简单直接且事务安全的实现。

### 标签
#intent/build #flow/ready #priority/critical #comp/engine #concept/storage #scope/core #ai/instruct #task/domain/storage #task/object/indexeddb-adapter #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 创建 `indexed-db.adapter.js` 文件

首先，我们创建适配器文件。

~~~~~act
write_file
src/storage/indexed-db.adapter.js
~~~~~
~~~~~javascript
import { flattenV6State, nestV7Messages } from '../data/transformer.js';
import { CONFIG_KEY, SELF_NAME_KEY, STORAGE_KEY_V5, STORAGE_KEY_V6 } from '../constants.js';

const DB_NAME = 'PTChatArchiverDB';
const DB_VERSION = 1;
const MESSAGES_STORE = 'messages';
const CONFIG_STORE = 'config'; // Future use, for now delegate to localStorage

/**
 * An adapter that implements the IStorageAdapter interface for IndexedDB.
 * @implements {IStorageAdapter}
 */
export class IndexedDBAdapter {
  /** @type {IDBDatabase | null} */
  db = null;

  init() {
    return new Promise((resolve, reject) => {
      if (this.db) return resolve();

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[Storage/IDB] Database error:', request.error);
        reject(new Error('Failed to open IndexedDB.'));
      };

      request.onupgradeneeded = (event) => {
        console.log('[Storage/IDB] Database upgrade needed.');
        const db = event.target.result;
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const store = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
          store.createIndex('by_channel', ['server', 'channel'], { unique: false });
          console.log(`[Storage/IDB] Object store "${MESSAGES_STORE}" created.`);
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('[Storage/IDB] Database initialized successfully.');
        resolve();
      };
    });
  }

  loadAllV6() {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized.'));

      const transaction = this.db.transaction(MESSAGES_STORE, 'readonly');
      const store = transaction.objectStore(MESSAGES_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(nestV7Messages(request.result));
      };
    });
  }

  saveAllV6(state) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized.'));

      const flatMessages = flattenV6State(state);
      const transaction = this.db.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      store.clear(); // Simple strategy for full-state save
      for (const msg of flatMessages) {
        store.put(msg);
      }
    });
  }

  // --- Configuration methods (delegated to localStorage for now) ---

  getConfig() {
    const defaultCfg = { pageSize: 1000, autoSaveInterval: 30 };
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      return Promise.resolve(stored ? { ...defaultCfg, ...JSON.parse(stored) } : defaultCfg);
    } catch (e) {
      return Promise.resolve(defaultCfg);
    }
  }

  saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return Promise.resolve();
  }

  getSelfName() {
    return Promise.resolve(localStorage.getItem(SELF_NAME_KEY) || '');
  }

  setSelfName(name) {
    localStorage.setItem(SELF_NAME_KEY, name.trim());
    return Promise.resolve();
  }

  clearAllData() {
    return new Promise((resolve, reject) => {
      // Clear legacy localStorage keys as well
      localStorage.removeItem(STORAGE_KEY_V6);
      localStorage.removeItem(STORAGE_KEY_V5);

      if (!this.db) return reject(new Error('Database not initialized.'));
      const transaction = this.db.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // Note: Accurately getting IDB size is complex. This is a placeholder.
  getRawSize() {
    return Promise.resolve(0); // Placeholder
  }

  // --- Legacy Migration Support ---
  // These are for the migration manager, not direct use
  loadAllV4() {
    return Promise.resolve(null); // Deprecated
  }
  removeV4Data() {
    return Promise.resolve(); // Deprecated
  }
  loadAllV5() {
    const data = localStorage.getItem(STORAGE_KEY_V5);
    return Promise.resolve(data ? JSON.parse(data) : null);
  }
  removeV5Data() {
    localStorage.removeItem(STORAGE_KEY_V5);
    return Promise.resolve();
  }
}
~~~~~

#### Acts 2: 调整 `storage/index.js` 以适应适配器模式

为了让 `StorageManager` 能够持有并管理不同的适配器实例，我们需要重构 `storage/index.js`。

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
import { LocalStorageAdapter } from './local-storage.adapter.js';

/**
 * Manages the storage backend for the application.
 * It holds an instance of a storage adapter and exposes its methods.
 * This abstracts the storage implementation from the rest of the app.
 */
class StorageManager {
  /** @type {import('./local-storage.adapter.js').LocalStorageAdapter} */
  adapter;

  constructor() {
    // For now, we only have one adapter. In the future, this class
    // would contain logic to decide which adapter to instantiate.
    this.adapter = new LocalStorageAdapter();
  }

  // --- Delegate all methods to the adapter ---

  init() {
    return this.adapter.init();
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
~~~~~
~~~~~javascript.new
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
~~~~~

### 下一步建议

我们已经成功地构建了 V7 架构的核心 `IndexedDBAdapter`，并且重构了 `StorageManager` 以支持适配器模式。现在，我们的应用理论上已经具备了使用 IndexedDB 的能力。

然而，还有一个至关重要的环节：**数据迁移**。用户的旧数据仍然存在于 LocalStorage 中。

下一步，**Step 4: 编写迁移逻辑与装配**，我们将：
1.  修改 `migrations.js`，添加一个 `migrateV6toV7` 函数，它会使用 `LocalStorageAdapter` 读取旧数据，并使用 `IndexedDBAdapter` 写入新数据库。
2.  在 `main.js` 的启动流程中调用这个迁移逻辑，向用户显示升级提示，并在后台完成无感的数据搬迁。

准备好后，我们就可以开始这最后也是最关键的一步。
