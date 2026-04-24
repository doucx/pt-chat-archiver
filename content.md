这是一个非常好的建议。随着迁移逻辑的移除，保留“V6”字样的命名不仅具有迷惑性，而且不再符合代码目前的语义。

我将把所有涉及完整数据集操作的方法名对齐为更通用的“Archive”语义：
- `loadAllV6` → `exportFullArchive` (代表将数据库内容导出为嵌套对象结构)
- `saveAllV6` → `overwriteFullArchive` (代表使用外部数据完全覆盖当前存档)
- `mergeAllV6` → `mergeFullArchive` (代表将外部数据合并到当前存档)

这将使代码的意图更加直观。

## [WIP] refactor: 重命名 V6 遗留方法以对齐数据导出语义

### 用户需求
将存储适配器和管理器中所有包含“V6”字样的方法重命名为更具通用性的“Archive”相关名称，以消除过时的版本暗示，使其更符合当前的导出/导入功能定义。

### 评论
通过消除“V6”这一特定版本的引用，我们成功地将特定的历史技术债务转化为了一套清晰的领域 API。这不仅提高了代码的可读性，也为未来可能的格式升级打下了更好的基础。

### 目标
1.  在 `IndexedDBAdapter` 和 `LocalStorageAdapter` 中重命名数据加载和保存方法。
2.  在 `StorageManager` 中更新对应的代理方法名。
3.  更新 `main.js` 中的 `dataAdapter` 和 `uiControls` 回调函数，以匹配新的方法名。

### 基本原理
我们将采用“导出 (Export) / 覆盖 (Overwrite) / 合并 (Merge)”这一组动词来描述对完整数据集的操作。`loadAllV6` 实际上是在执行导出操作，因为它将扁平的数据库记录转换回了嵌套的导出格式，因此重命名为 `exportFullArchive` 最为准确。

### 标签
#intent/refine #flow/ready #priority/low #comp/storage #scope/core #scope/dx #ai/refine #task/domain/refactoring #task/object/archive-api-rename #task/action/cleanup #task/state/continue

---

### Script

#### Acts 1: 更新 IndexedDB 适配器方法

将 `IndexedDBAdapter` 中的方法名从 V6 迁移到 Archive 语义。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
  /**
   * 读取所有消息并组装为嵌套的存档结构。
   */
  async exportFullArchive() {
    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
    const flatMessages = await this._req(store.getAll());
    return nestV7Messages(flatMessages);
  }

  /**
   * 覆盖完整的存档状态。
   * 目前采用全量清理 + 全量写入的策略以保证一致性。
   */
  async overwriteFullArchive(state) {
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
   * 将嵌套的存档状态合并到当前数据库。
   * 不执行清理，利用 ID 主键自动去重。
   */
  mergeFullArchive(state) {
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
~~~~~

#### Acts 2: 更新 LocalStorage 适配器方法

~~~~~act
patch_file
src/storage/local-storage.adapter.js
~~~~~
~~~~~javascript.old
  init() {
    return Promise.resolve();
  }

  loadAllV6() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_V6);
      return Promise.resolve(data ? JSON.parse(data) : {});
    } catch (e) {
      console.error('[Storage] Failed to parse V6 archive:', e);
      return Promise.resolve({});
    }
  }

  saveAllV6(state) {
    try {
      localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(state));
    } catch (e) {
      console.error('[Storage] Failed to save V6 archive:', e);
    }
    return Promise.resolve();
  }
~~~~~
~~~~~javascript.new
  init() {
    return Promise.resolve();
  }

  exportFullArchive() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_V6);
      return Promise.resolve(data ? JSON.parse(data) : {});
    } catch (e) {
      console.error('[Storage] Failed to parse archive from LocalStorage:', e);
      return Promise.resolve({});
    }
  }

  overwriteFullArchive(state) {
    try {
      localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(state));
    } catch (e) {
      console.error('[Storage] Failed to save archive to LocalStorage:', e);
    }
    return Promise.resolve();
  }
~~~~~

#### Acts 3: 更新 StorageManager 代理

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  deleteMessages(ids) {
    if (this.adapter?.deleteMessages) return this.adapter.deleteMessages(ids);
    return Promise.resolve();
  }

  loadAllV6() {
    return this.adapter.loadAllV6();
  }

  saveAllV6(state) {
    return this.adapter.saveAllV6(state);
  }

  mergeAllV6(state) {
    return this.adapter.mergeAllV6(state);
  }

  getConfig() {
~~~~~
~~~~~javascript.new
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
~~~~~

#### Acts 4: 更新 Main.js 中的调用

更新 `dataAdapter` 和 `uiControls` 传递给 UI 层的回调函数。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
      getMessagesChunk: async (server, channel, lastTime, limit) => {
        return await storageManager.getMessagesChunk(server, channel, lastTime, limit);
      },
      getAllData: async () => await storageManager.loadAllV6(), // 用于导出功能
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state),
      mergeMessagesToStorage: async (state) => await storageManager.mergeAllV6(state),
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
~~~~~
~~~~~javascript.new
      getMessagesChunk: async (server, channel, lastTime, limit) => {
        return await storageManager.getMessagesChunk(server, channel, lastTime, limit);
      },
      getAllData: async () => await storageManager.exportFullArchive(), // 用于导出功能
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.overwriteFullArchive(state),
      mergeMessagesToStorage: async (state) => await storageManager.mergeFullArchive(state),
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
~~~~~

### 下一步建议
- **ULID 生成逻辑检查**: 目前在 `overwriteFullArchive` 和 `mergeFullArchive` 中，我们为所有不带 ID 的消息生成了 ULID。由于导出的 JSON 通常不包含 ID，这意味着每次导入都会生成新的 ID。虽然 `mergeAndDeduplicateMessages` 通过内容签名处理了去重，但这可能导致数据库中虽然内容相同但 ID 不同的微妙情况。可以考虑在导出时保留 ID，或者在导入时基于内容签名重新生成确定的 ID。
- **UI 状态通知**: 目前 `overwriteFullArchive` 之后，UI 需要手动刷新。可以考虑在 `StorageManager` 中增加一个事件订阅机制，当存档发生重大变更时自动通知订阅者。
