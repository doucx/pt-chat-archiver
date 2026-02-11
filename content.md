## [WIP] feat: 实现 IndexedDB 适配器与异步存储管理器

### 评论
这是架构从同步 IO 转向异步 IO 的关键一步。通过引入 `IndexedDBAdapter`，我们将拥有处理大规模历史记录的能力。同时，`StorageManager` 的重构使其能够根据策略动态选择底层存储后端，为未来的无缝迁移做好了准备。

### 目标
1.  在 `src/constants.js` 中定义数据库常量。
2.  创建 `src/storage/indexed-db-adapter.js`，实现基于 Promise 的增删改查和 Schema 定义。
3.  重构 `src/storage/index.js` 中的 `StorageManager`，使其支持异步初始化 (`init`) 和适配器注入。
4.  更新并新增相关测试，验证新适配器的行为及管理器的异步特性。

### 基本原理
- **IndexedDB**: 浏览器原生的高性能 NoSQL 数据库，适合存储结构化的大量数据。
- **Adapter 模式**: 将存储细节封装在适配器内部，对外暴露统一的 API，使得上层业务逻辑（UI、数据处理）无需感知底层是 LocalStorage 还是 IndexedDB。
- **异步初始化**: 数据库的打开连接是异步操作，因此 `StorageManager` 必须引入生命周期管理。

### 标签
#intent/build #flow/ready #priority/high #comp/engine #concept/storage #scope/core #ai/instruct #task/domain/storage #task/object/indexed-db-adapter #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 定义数据库常量

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
export const CONFIG_KEY = 'chatLogArchive_config';

export const STORAGE_WARNING_THRESHOLD_MB = 3.5; // 存储警告阈值 (MB)
~~~~~
~~~~~javascript.new
export const CONFIG_KEY = 'chatLogArchive_config';

// IndexedDB 配置
export const DB_NAME = 'pt-chat-archiver-v7';
export const DB_VERSION = 1;
export const STORE_MESSAGES = 'messages';
export const STORE_CONFIG = 'config';

export const STORAGE_WARNING_THRESHOLD_MB = 3.5; // 存储警告阈值 (MB)
~~~~~

#### Acts 2: 创建 `IndexedDBAdapter`

这是一个完整的 IndexedDB 封装实现，它利用我们之前创建的 `transformer.js` 来处理数据格式转换。

~~~~~act
write_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
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
        // 创建消息存储 Store
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
          msgStore.createIndex('server', 'server', { unique: false });
          msgStore.createIndex('channel', 'channel', { unique: false });
          msgStore.createIndex('time', 'time', { unique: false });
        }
        // 创建配置存储 Store
        if (!db.objectStoreNames.contains(STORE_CONFIG)) {
          db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
        }
      };
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
   * 获取配置
   */
  getConfig() {
    const defaultCfg = { pageSize: 1000, autoSaveInterval: 30 };
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

  /**
   * 清除所有数据
   */
  clearAllData() {
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
   * IndexedDB 没有直接 API 获取大小，这里只能返回一个近似值或者 0。
   * 精确计算需要遍历所有数据，这在性能上是不划算的。
   */
  async getRawSize() {
    // 暂不支持 IDB 大小计算，或者可以在将来实现
    return 0;
  }
  
  // --- Legacy Support ---
  loadAllV4() { return Promise.resolve(null); }
  removeV4Data() { return Promise.resolve(); }
  loadAllV5() { return Promise.resolve(null); }
  removeV5Data() { return Promise.resolve(); }
}
~~~~~

#### Acts 3: 更新 `StorageManager` 以支持异步初始化

我们将重构 `StorageManager`，使其不再在构造函数中硬编码 `LocalStorageAdapter`，而是提供 `init()` 方法来决定使用哪个适配器。目前默认仍使用 `LocalStorageAdapter` 以保持向后兼容，直到我们完成迁移逻辑。

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
~~~~~
~~~~~javascript.new
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
~~~~~

#### Acts 4: 更新测试

我们需要更新现有的 `storage.test.js` 以适应 `StorageManager` 的异步初始化，并新增针对 `IndexedDBAdapter` 的测试。

~~~~~act
patch_file
tests/storage.test.js
~~~~~
~~~~~javascript.old
  it('应当能正确保存和读取 V6 消息数据', async () => {
    const mockData = { 'Main Server': { Local: [{ content: 'hello' }] } };
    await storageManager.saveAllV6(mockData);
    const loadedData = await storageManager.loadAllV6();
    expect(loadedData).toEqual(mockData);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_V6))).toEqual(mockData);
  });
~~~~~
~~~~~javascript.new
  it('应当能正确保存和读取 V6 消息数据', async () => {
    await storageManager.init(); // 必须显式初始化
    const mockData = { 'Main Server': { Local: [{ content: 'hello' }] } };
    await storageManager.saveAllV6(mockData);
    const loadedData = await storageManager.loadAllV6();
    expect(loadedData).toEqual(mockData);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_V6))).toEqual(mockData);
  });
~~~~~

~~~~~act
patch_file
tests/storage.test.js
~~~~~
~~~~~javascript.old
  it('应当能正确管理配置项并提供默认值', async () => {
    const defaultConfig = await storageManager.getConfig();
    expect(defaultConfig.pageSize).toBe(1000);

    const newConfig = { pageSize: 50, autoSaveInterval: 60 };
    await storageManager.saveConfig(newConfig);
    const loadedConfig = await storageManager.getConfig();
    expect(loadedConfig).toEqual(newConfig);
  });
~~~~~
~~~~~javascript.new
  it('应当能正确管理配置项并提供默认值', async () => {
    await storageManager.init();
    const defaultConfig = await storageManager.getConfig();
    expect(defaultConfig.pageSize).toBe(1000);

    const newConfig = { pageSize: 50, autoSaveInterval: 60 };
    await storageManager.saveConfig(newConfig);
    const loadedConfig = await storageManager.getConfig();
    expect(loadedConfig).toEqual(newConfig);
  });
~~~~~

~~~~~act
patch_file
tests/storage.test.js
~~~~~
~~~~~javascript.old
  it('应当能保存和检索用户昵称', async () => {
    await storageManager.setSelfName('TestUser  ');
    const name = await storageManager.getSelfName();
    expect(name).toBe('TestUser'); // 验证 trim
    expect(localStorage.getItem(SELF_NAME_KEY)).toBe('TestUser');
  });

  it('清空操作应当移除相关 key', async () => {
    await storageManager.saveAllV6({ a: 1 });
    await storageManager.clearAllData();
    const loadedData = await storageManager.loadAllV6();
    expect(loadedData).toEqual({});
  });
});
~~~~~
~~~~~javascript.new
  it('应当能保存和检索用户昵称', async () => {
    await storageManager.init();
    await storageManager.setSelfName('TestUser  ');
    const name = await storageManager.getSelfName();
    expect(name).toBe('TestUser'); // 验证 trim
    expect(localStorage.getItem(SELF_NAME_KEY)).toBe('TestUser');
  });

  it('清空操作应当移除相关 key', async () => {
    await storageManager.init();
    await storageManager.saveAllV6({ a: 1 });
    await storageManager.clearAllData();
    const loadedData = await storageManager.loadAllV6();
    expect(loadedData).toEqual({});
  });
});
~~~~~

现在创建一个新的测试文件来验证 `IndexedDBAdapter`。由于 jsdom 环境对 IDB 支持有限，我们使用 Mock 的方式来验证逻辑流程。

~~~~~act
write_file
tests/storage/indexed-db.test.js
~~~~~
~~~~~javascript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDBAdapter } from '../../src/storage/indexed-db-adapter.js';
import { DB_NAME, DB_VERSION, STORE_MESSAGES } from '../../src/constants.js';

// 简单的 Mock IDB 实现
const mockIDB = {
  open: vi.fn(),
};

global.indexedDB = mockIDB;

describe('IndexedDBAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new IndexedDBAdapter();
    vi.clearAllMocks();
  });

  it('init() 应当尝试打开正确的数据库版本', async () => {
    const mockRequest = {
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
      result: { objectStoreNames: { contains: () => false }, createObjectStore: vi.fn(() => ({ createIndex: vi.fn() })) }
    };
    
    mockIDB.open.mockReturnValue(mockRequest);

    const initPromise = adapter.init();
    
    // 模拟成功回调
    mockRequest.onsuccess({ target: mockRequest });
    
    await initPromise;
    
    expect(mockIDB.open).toHaveBeenCalledWith(DB_NAME, DB_VERSION);
    expect(adapter.db).toBeDefined();
  });
  
  // 更多详细的逻辑测试依赖于复杂的 Mock，这里主要验证基本连接流程。
  // 在真实浏览器环境测试 (e.g. Playwright) 会更有效。
});
~~~~~

### 下一步建议
目前我们已经完成了 `IndexedDBAdapter` 的实现和 `StorageManager` 的改造。系统现在具备了“双核”能力。

接下来的 **Step 4** 将是将两者结合的关键：
1.  实现迁移逻辑：将 LocalStorage 中的旧数据搬迁到 IndexedDB。
2.  在 `main.js` 中启用新的 `init()` 流程，检测并执行迁移。
3.  正式切换 `StorageManager` 使用 `IndexedDBAdapter`。
