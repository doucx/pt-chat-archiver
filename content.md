这是一个非常实用的建议。由于系统已经全面切换到基于 **ULID** 的存储架构，每个消息都有一个唯一的、包含时间戳信息的 ID。这意味着合并不同来源的数据变得极其简单：只需要将新数据 `put` 进数据库，IndexedDB 会根据主键（ID）自动覆盖（如果 ID 相同）或新增（如果 ID 不同），天然实现了幂等去重。

我将为 UI 添加“导入并合并”按钮，并在存储层和控制器层增加相应的合并逻辑。

## [WIP] feat: 添加“导入并合并”功能以支持无损合并聊天记录

### 用户需求
用户希望能够将外部导出的 JSON 存档合并到当前数据库中，而不是像现在的“导入 JSON”那样完全覆盖当前数据。利用现有的 ULID 机制，系统应能自动识别并跳过重复的消息。

### 评论
随着用户在不同设备上（或在重装系统后）导出/导入数据的需求增加，全量覆盖式的导入显得过于武断且容易导致数据丢失。利用 ULID 的唯一性，实现增量合并是存储系统演进到 V7 后的逻辑必然。

### 目标
1.  在设置界面的维护操作区添加“导入并合并”按钮。
2.  在 `IndexedDBAdapter` 中实现 `mergeAllV6` 方法，将嵌套结构展平后增量写入数据库。
3.  在 UI 控制器中实现对应的文件读取和合并逻辑，并提供用户确认反馈。

### 基本原理
1.  **去重逻辑**: 使用 `store.put()`。由于消息的 `id` 是主键，`put` 操作在遇到相同 `id` 时会更新记录，在遇到新 `id` 时会新增记录。这在语义上等同于“合并”。
2.  **数据转换**: 使用现有的 `flattenV6State` 工具函数将导入的 V6 嵌套 JSON 转换为 V7 扁平数组。
3.  **UI 交互**: 模仿现有的导入逻辑，使用文件选择器读取 JSON，并在执行前提示用户预计导入的服务器数量。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #comp/engine #concept/storage #scope/ux #ai/delegate #task/domain/storage #task/object/import-merge #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 在 `IndexedDBAdapter` 中添加合并逻辑

我们需要在适配器中增加一个方法，它与 `saveAllV6` 类似但**不执行** `clear()` 操作。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  /**
   * 保存完整的 V6 状态。
   * 目前采用全量清理 + 全量写入的策略以保证一致性 (未来可优化为差异更新)。
   */
  saveAllV6(state) {
    this.cache = { servers: null, channels: {} };
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
~~~~~
~~~~~javascript.new
  /**
   * 保存完整的 V6 状态。
   * 目前采用全量清理 + 全量写入的策略以保证一致性 (未来可优化为差异更新)。
   */
  saveAllV6(state) {
    this.cache = { servers: null, channels: {} };
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
   * 合并 V6 状态到当前数据库。
   * 不执行清理，利用 ID 主键自动去重。
   */
  mergeAllV6(state) {
    this.cache = { servers: null, channels: {} };
    return new Promise((resolve, reject) => {
      const flatMessages = flattenV6State(state);
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      for (const msg of flatMessages) {
        if (!msg.id) {
          msg.id = generateULID(new Date(msg.time).getTime());
        }
        store.put(msg);
      }
    });
  }

  /**
   * 获取配置
~~~~~

#### Acts 2: 在 `StorageManager` 中暴露合并接口

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  saveAllV6(state) {
    return this.adapter.saveAllV6(state);
  }

  getConfig() {
~~~~~
~~~~~javascript.new
  saveAllV6(state) {
    return this.adapter.saveAllV6(state);
  }

  mergeAllV6(state) {
    return this.adapter.mergeAllV6(state);
  }

  getConfig() {
~~~~~

#### Acts 3: 更新 UI 模板以添加按钮

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
                    <div class="config-actions" style="display: flex; gap: 8px;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">扫描重复记录</button>
                        <button id="log-archive-import-button" class="log-archive-ui-button" style="flex-grow: 1;">导入 JSON</button>
                    </div>
                </div>
~~~~~
~~~~~javascript.new
                    <div class="config-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button">扫描重复</button>
                        <button id="log-archive-import-button" class="log-archive-ui-button">导入(覆盖)</button>
                        <button id="log-archive-import-merge-button" class="log-archive-ui-button" style="grid-column: span 2; background-color: var(--color-success);">导入并合并 JSON (推荐)</button>
                    </div>
                </div>
~~~~~

#### Acts 4: 在 `dom.js` 中注册新按钮

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    downloadTxtButton: document.getElementById('log-archive-download-txt-button'),
    importButton: document.getElementById('log-archive-import-button'),
    clearButton: document.getElementById('log-archive-clear-button'),

    // Pagination Controls
~~~~~
~~~~~javascript.new
    downloadTxtButton: document.getElementById('log-archive-download-txt-button'),
    importButton: document.getElementById('log-archive-import-button'),
    importMergeButton: document.getElementById('log-archive-import-merge-button'),
    clearButton: document.getElementById('log-archive-clear-button'),

    // Pagination Controls
~~~~~

#### Acts 5: 在 `ui/index.js` 中实现合并回调

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    input.click();
  };

  const clearAllData = async () => {
~~~~~
~~~~~javascript.new
    input.click();
  };

  const importAndMergeData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);

          if (
            typeof importedData !== 'object' ||
            importedData === null ||
            Array.isArray(importedData)
          ) {
            throw new Error('无效的存档格式。');
          }

          const serverCount = Object.keys(importedData).length;
          const msg = `准备合并文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n系统将自动跳过重复记录。是否继续？`;

          if (confirm(msg)) {
            dom.importMergeButton.disabled = true;
            dom.importMergeButton.textContent = '正在合并...';

            await appCallbacks.mergeMessagesToStorage(importedData);

            dom.importMergeButton.textContent = '✅ 合并成功';
            setTimeout(() => {
              dom.importMergeButton.disabled = false;
              dom.importMergeButton.textContent = '导入并合并 JSON (推荐)';
            }, UI_FEEDBACK_DURATION);

            refreshView();
          }
        } catch (err) {
          console.error('[Archiver] Merge failed:', err);
          alert(`合并失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };

    input.click();
  };

  const clearAllData = async () => {
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    deleteV6Backup,
    recoverLegacyData,
    clearLegacyData,
    downloadJSON,
    downloadTXT,
~~~~~
~~~~~javascript.new
    deleteV6Backup,
    recoverLegacyData,
    clearLegacyData,
    importAndMergeData,
    downloadJSON,
    downloadTXT,
~~~~~

#### Acts 6: 在 `events.js` 中绑定事件

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.importButton.addEventListener('click', () => {
    callbacks.importAllData();
  });

  // --- Initial value setup ---
~~~~~
~~~~~javascript.new
  dom.importButton.addEventListener('click', () => {
    callbacks.importAllData();
  });

  dom.importMergeButton.addEventListener('click', () => {
    callbacks.importAndMergeData();
  });

  // --- Initial value setup ---
~~~~~

#### Acts 7: 在 `main.js` 中完成回调链闭环

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state), // 仍提供给批量导入等特殊维护操作使用
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
~~~~~
~~~~~javascript.new
    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state), // 仍提供给批量导入等特殊维护操作使用
      mergeMessagesToStorage: async (state) => await storageManager.mergeAllV6(state),
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
~~~~~

### 下一步建议
- **性能优化**: 如果用户尝试合并非常巨大的 JSON（例如包含数万条消息），当前的 `mergeAllV6` 仍然是在一个事务中循环 `put`。虽然 IndexedDB 处理得不错，但在主线程进行大 JSON 的 `flattenV6State` 可能会引起短暂卡顿。未来可以考虑引入 Web Worker 来处理大数据集的展平。
- **冲突策略**: 目前是简单的覆盖。既然是同一个用户，这种策略是安全的。如果未来考虑多设备同步，可能需要更复杂的冲突解决方法。
