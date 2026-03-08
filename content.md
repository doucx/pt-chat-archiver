收到指令。为了彻底解决主线程的数据序列化和 I/O 带来的 UI 卡顿，我将为你实现 Web Worker 架构。我们将把 IndexedDB 的所有操作移入独立的 Worker 线程，并在主线程通过 RPC 与其进行通信。

## [WIP] refactor(storage): 将 IndexedDB 操作重定向至 Web Worker 以实现主线程解耦

### 用户需求
实现性能重构路线图的第三阶段：引入 Web Worker。将 `IndexedDBAdapter` 移入 Web Worker，并在主线程保留相应的代理适配器，通过消息传递实现数据的异步读写，从而彻底避免数据库操作导致的 UI 渲染阻塞。

### 评论
这是本次性能重构中最关键的一环，真正意义上实现了主线程只负责 UI 渲染和事件监听，繁重的数据 I/O 被彻底剥离。得益于先前的异步化改造，接入 Worker RPC 的过程将非常平滑，无需对高层业务逻辑进行大量修改。

### 目标
1. 创建 `worker.js`，包含 `IndexedDBAdapter` 的实例并监听 `postMessage` 消息。
2. 创建 `worker-adapter.js`，通过 Promise 和 `postMessage` 封装一套 RPC 通信层，暴露与 `IndexedDBAdapter` 完全相同的接口。
3. 修改 `StorageManager` 的初始化逻辑，使用 `WorkerAdapter` 替代 `IndexedDBAdapter`。
4. 调整 `MigrationManager` 中的适配器类型判定，使其兼容 `WorkerAdapter` 的类名。

### 基本原理
利用 Vite 的 `?worker&inline` 特性将 Worker 脚本内联打包为 base64 字符串（借助 vite-plugin-monkey 的能力），确保在 Userscript（油猴脚本）环境下的高度兼容性。主线程与 Worker 之间通过唯一的消息 ID（`msgId`）和 `Promise` 的 resolve/reject 进行匹配映射，实现无缝的 RPC 调用。由于我们在前面阶段已确保存储接口返回 Promise 且数据属于结构化可克隆对象，这次底层替换不会对上层消费者产生感知。

### 标签
#intent/refine #flow/ready #priority/high #comp/build #concept/executor #scope/core #ai/delegate #task/domain/storage #task/object/indexed-db-worker #task/action/integration #task/state/begin

---

### Script

#### Acts 1: 创建 Web Worker 及适配器

我们将创建后台运行的 `worker.js` 以及在主线程负责代理调用的 `worker-adapter.js`。

~~~~~act
write_file
src/storage/worker.js
~~~~~
~~~~~javascript
import { IndexedDBAdapter } from './indexed-db-adapter.js';

const adapter = new IndexedDBAdapter();

self.onmessage = async (e) => {
  const { id, method, args } = e.data;
  try {
    if (typeof adapter[method] === 'function') {
      const result = await adapter[method](...args);
      self.postMessage({ id, result });
    } else {
      throw new Error(`Method ${method} not found in adapter`);
    }
  } catch (error) {
    self.postMessage({ id, error: error.message || error.toString() });
  }
};
~~~~~

~~~~~act
write_file
src/storage/worker-adapter.js
~~~~~
~~~~~javascript
import IDBWorker from './worker.js?worker&inline';

/**
 * 将对 IndexedDBAdapter 的调用代理到 Web Worker 中。
 * 提供与 IndexedDBAdapter 完全相同的 Promise 接口。
 */
export class WorkerAdapter {
  constructor() {
    this.worker = new IDBWorker();
    this.msgId = 0;
    this.pending = new Map();

    this.worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      if (this.pending.has(id)) {
        const { resolve, reject } = this.pending.get(id);
        if (error) {
          reject(new Error(error));
        } else {
          resolve(result);
        }
        this.pending.delete(id);
      }
    };

    this.worker.onerror = (err) => {
      console.error('[WorkerAdapter] Worker error:', err);
    };
  }

  _call(method, args = []) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, args });
    });
  }

  // --- 代理 IndexedDBAdapter 的所有公共方法 ---

  init() { return this._call('init'); }
  putMessage(msg) { return this._call('putMessage', [msg]); }
  putMessages(msgs) { return this._call('putMessages', [msgs]); }
  getServers() { return this._call('getServers'); }
  getChannels(server) { return this._call('getChannels', [server]); }
  getMessages(server, channel, page, pageSize) { return this._call('getMessages', [server, channel, page, pageSize]); }
  getLatestMessages(server, channel, limit) { return this._call('getLatestMessages', [server, channel, limit]); }
  loadAllV6() { return this._call('loadAllV6'); }
  saveAllV6(state) { return this._call('saveAllV6', [state]); }
  getConfig() { return this._call('getConfig'); }
  saveConfig(config) { return this._call('saveConfig', [config]); }
  getSelfName() { return this._call('getSelfName'); }
  setSelfName(name) { return this._call('setSelfName', [name]); }
  clearAllData() { return this._call('clearAllData'); }
  getRawSize() { return this._call('getRawSize'); }
  getTotalMessageCount() { return this._call('getTotalMessageCount'); }
  
  // --- 旧版遗留兼容接口 ---
  loadAllV4() { return this._call('loadAllV4'); }
  removeV4Data() { return this._call('removeV4Data'); }
  loadAllV5() { return this._call('loadAllV5'); }
  removeV5Data() { return this._call('removeV5Data'); }
}
~~~~~

#### Acts 2: 将 StorageManager 切入 Worker 架构

修改存储管理器的入口，弃用主线程直接实例化 IndexedDB，改为实例化 Worker 适配器。同时更新迁移管理器对适配器类型的检测。

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
import { MigrationManager } from '../migrations.js';
import { IndexedDBAdapter } from './indexed-db-adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';

/**
~~~~~
~~~~~javascript.new
import { MigrationManager } from '../migrations.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
import { WorkerAdapter } from './worker-adapter.js';

/**
~~~~~

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
    if (useIndexedDB) {
      const targetAdapter = new IndexedDBAdapter();
      await targetAdapter.init();

      // --- 迁移逻辑集成 ---
~~~~~
~~~~~javascript.new
    if (useIndexedDB) {
      const targetAdapter = new WorkerAdapter();
      await targetAdapter.init();

      // --- 迁移逻辑集成 ---
~~~~~

~~~~~act
patch_file
src/migrations.js
~~~~~
~~~~~javascript.old
  async runSilentMigrations(sourceAdapter, targetAdapter) {
    // 检查是否需要从 V6 (LocalStorage) 迁移到 V7 (IndexedDB)
    const v6DataExists = localStorage.getItem(STORAGE_KEY_V6) !== null;

    // 如果源数据存在，且目标适配器是 IndexedDB
    if (v6DataExists && targetAdapter.constructor.name === 'IndexedDBAdapter') {
      // 安全检查：只有当 IDB 为空时才执行静默覆盖迁移
~~~~~
~~~~~javascript.new
  async runSilentMigrations(sourceAdapter, targetAdapter) {
    // 检查是否需要从 V6 (LocalStorage) 迁移到 V7 (IndexedDB)
    const v6DataExists = localStorage.getItem(STORAGE_KEY_V6) !== null;

    // 如果源数据存在，且目标适配器是 IndexedDB 或 WorkerAdapter
    if (v6DataExists && (targetAdapter.constructor.name === 'IndexedDBAdapter' || targetAdapter.constructor.name === 'WorkerAdapter')) {
      // 安全检查：只有当 IDB 为空时才执行静默覆盖迁移
~~~~~

### 下一步建议
实施完成后，我们需要测试脚本。Vite 的热更新将重载带有 Worker 的应用。在此期间进行一些页面切换或发消息的操作，观察控制台是否有跨线程传递报错，确认查重、加载数据等耗时操作是否不再引起主线程的冻结。测试通过后，我们将使用一个新的 `[COMMIT]` 计划提交更改。
