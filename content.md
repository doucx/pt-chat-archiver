你的分析非常准确。IndexedDB 提供了远超 LocalStorage 的存储空间（通常是磁盘剩余空间的比例），因此原有的“5MB 限制”和 3.5MB 警告不仅不再适用，反而会给用户带来不必要的心理负担。

我将执行以下操作：
1.  **存储引擎升级**：在 `IndexedDBAdapter` 中实现消息总数统计和基于序列化大小的存储估算逻辑。
2.  **UI 去冗余**：移除所有关于 5MB 限制的文案和警告逻辑。
3.  **增强设置页**：展示总消息条数，并添加“删除旧版备份”功能（针对迁移后产生的 `_backup` 数据）。

## [WIP] feat: 优化存储容量展示并支持删除旧版 LocalStorage 备份

### 用户需求
1.  **清理误导性文案**：移除 5MB 限制展示和 3.5MB 自动警告。
2.  **实现 IDB 大小估算**：目前 `getRawSize` 返回 0，需要实现真实的估算逻辑。
3.  **信息增强**：在设置页面展示消息总条数。
4.  **备份管理**：支持用户手动删除 LocalStorage 中的 V6 备份数据。

### 评论
随着存储架构转向 IndexedDB，原本紧迫的容量管理现在变得更加从容。展示“总消息条数”比展示“已用 MB”对用户更有意义，因为前者直接对应了用户的使用深度。同时，提供旧备份清理功能有助于用户释放 LocalStorage 这一相对昂贵的浏览器资源。

### 目标
1.  移除 `constants.js` 中的警告阈值，并修改 `renderer.js` 逻辑。
2.  在 `IndexedDBAdapter` 中实现 `getTotalMessageCount` 和 `getRawSize`（遍历估算）。
3.  更新 UI 模板以显示消息总数和备份清理按钮。
4.  实现 `LocalStorageAdapter.deleteV6Backup` 及其 UI 调用链路。

### 基本原理
由于 IndexedDB 没有直接返回 ObjectStore 总字节数的同步 API，我们将通过 `IDBObjectStore.getAll()` 获取所有数据并利用 `JSON.stringify` 或 `Blob` 进行估算。虽然这在大数据量下有一定开销，但由于我们仅在用户打开“设置”页面时进行此操作，性能影响在可控范围内。

### 标签
#intent/build #flow/ready #priority/medium #comp/storage #comp/ui #concept/state #scope/ux #ai/instruct #task/domain/storage #task/object/idb-optimization #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 更新常量与适配器接口

移除旧阈值，并为 `IndexedDBAdapter` 和 `LocalStorageAdapter` 增加必要的方法。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
export const STORE_MESSAGES = 'messages';
export const STORE_CONFIG = 'config';

export const STORAGE_WARNING_THRESHOLD_MB = 3.5; // 存储警告阈值 (MB)

// 定义被视为主服务器的域名列表，以启用精细化解析
~~~~~
~~~~~javascript.new
export const STORE_MESSAGES = 'messages';
export const STORE_CONFIG = 'config';

// 定义被视为主服务器的域名列表，以启用精细化解析
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  /**
   * 获取估算的存储大小 (字节)
   * IndexedDB 没有直接 API 获取大小，这里只能返回一个近似值或者 0。
   * 精确计算需要遍历所有数据，这在性能上是不划算的。
   */
  async getRawSize() {
    // 暂不支持 IDB 大小计算，或者可以在将来实现
    return 0;
  }
~~~~~
~~~~~javascript.new
  /**
   * 获取估算的存储大小 (字节)
   * 遍历所有存储的消息和配置，并累加序列化后的字节大小。
   */
  async getRawSize() {
    return new Promise((resolve) => {
      const tx = this._tx([STORE_MESSAGES, STORE_CONFIG], 'readonly');
      let totalSize = 0;

      const countSize = (storeName) => {
        return new Promise((res) => {
          const store = tx.objectStore(storeName);
          const request = store.getAll();
          request.onsuccess = () => {
            const data = request.result;
            const size = new Blob([JSON.stringify(data)]).size;
            res(size);
          };
          request.onerror = () => res(0);
        });
      };

      Promise.all([countSize(STORE_MESSAGES), countSize(STORE_CONFIG)]).then((sizes) => {
        totalSize = sizes.reduce((a, b) => a + b, 0);
        resolve(totalSize);
      });
    });
  }

  /**
   * 获取数据库中存储的消息总条数。
   */
  getTotalMessageCount() {
    return new Promise((resolve) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  }
~~~~~

~~~~~act
patch_file
src/storage/local-storage.adapter.js
~~~~~
~~~~~javascript.old
  removeV5Data() {
    localStorage.removeItem(STORAGE_KEY_V5);
    return Promise.resolve();
  }
}
~~~~~
~~~~~javascript.new
  removeV5Data() {
    localStorage.removeItem(STORAGE_KEY_V5);
    return Promise.resolve();
  }

  hasV6Backup() {
    return localStorage.getItem(`${STORAGE_KEY_V6}_backup`) !== null;
  }

  deleteV6Backup() {
    localStorage.removeItem(`${STORAGE_KEY_V6}_backup`);
    return Promise.resolve();
  }
}
~~~~~

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  getRawSize() {
    return this.adapter.getRawSize();
  }

  loadAllV4() {
~~~~~
~~~~~javascript.new
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
~~~~~

#### Acts 2: 更新 UI 模板与渲染逻辑

移除误导性的 5MB 限制，添加总条数展示。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" class="info-text-dim" style="margin-bottom: 5px;"></div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
~~~~~
~~~~~javascript.new
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" class="info-text-dim" style="margin-bottom: 2px;"></div>
                <div id="log-archive-config-msg-count" class="info-text-dim" style="margin-bottom: 8px;"></div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
~~~~~

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
            <div class="config-group" style="margin-top: auto; border-top: 1px dashed #444; padding-top: 20px;">
                <label style="color: #ff6666;">危险操作</label>
                <button id="log-archive-clear-button" class="log-archive-ui-button">清空所有本地存档</button>
            </div>
~~~~~
~~~~~javascript.new
            <div id="log-archive-delete-backup-group" class="config-group" style="margin-top: auto; display: none;">
                <label>兼容性清理</label>
                <button id="log-archive-delete-backup-button" class="log-archive-ui-button">删除旧版 LocalStorage 备份</button>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    迁移至新数据库后生成的备份文件，删除可释放浏览器 LocalStorage 空间。
                </div>
            </div>

            <div class="config-group" style="margin-top: 10px; border-top: 1px dashed #444; padding-top: 20px;">
                <label style="color: #ff6666;">危险操作</label>
                <button id="log-archive-clear-button" class="log-archive-ui-button">清空所有本地存档</button>
            </div>
~~~~~

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    saveNowButton: document.getElementById('log-archive-save-now-button'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
    cleanButton: document.getElementById('log-archive-clean-button'),
~~~~~
~~~~~javascript.new
    saveNowButton: document.getElementById('log-archive-save-now-button'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
    configMsgCount: document.getElementById('log-archive-config-msg-count'),
    deleteBackupGroup: document.getElementById('log-archive-delete-backup-group'),
    deleteBackupButton: document.getElementById('log-archive-delete-backup-button'),
    cleanButton: document.getElementById('log-archive-clean-button'),
~~~~~

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    if (viewMode === 'config') {
      // 异步更新存储信息，不阻塞渲染
      getStorageUsageInMB().then((usageMB) => {
        dom.configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;
      });

      const { lastSavedTime } = uiState.getState();
~~~~~
~~~~~javascript.new
    if (viewMode === 'config') {
      // 异步更新存储信息，不阻塞渲染
      getStorageUsageInMB().then((usageMB) => {
        dom.configStorageInfo.textContent = `估算数据占用: ${usageMB.toFixed(2)} MB`;
      });

      storageManager.getTotalMessageCount().then((count) => {
        dom.configMsgCount.textContent = `存档消息总数: ${count.toLocaleString()} 条`;
      });

      // 检查是否有备份
      if (storageManager.hasV6Backup()) {
        dom.deleteBackupGroup.style.display = 'flex';
      } else {
        dom.deleteBackupGroup.style.display = 'none';
      }

      const { lastSavedTime } = uiState.getState();
~~~~~

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
  return {
    render,
    checkStorageUsage: async () => {
      const usageMB = await getStorageUsageInMB();
      let warningElement = document.getElementById('log-archive-storage-warning');
      if (usageMB > 3.5) {
        if (!warningElement) {
          warningElement = document.createElement('div');
          warningElement.id = 'log-archive-storage-warning';
          dom.header.insertBefore(
            warningElement,
            dom.header.querySelector('#log-archive-ui-controls'),
          );
        }
        warningElement.textContent = `⚠️ 存储占用过高 (${usageMB.toFixed(1)}MB)，请及时清理！`;
      } else if (warningElement) {
        warningElement.remove();
      }
    },
  };
~~~~~
~~~~~javascript.new
  return {
    render,
    checkStorageUsage: async () => {
      // IndexedDB 时代不再需要硬性的容量警告，此处改为静默。
      // 将来如果需要，可以实现基于浏览器 Quota 的警告。
    },
  };
~~~~~

#### Acts 3: 绑定清理事件并完善 API

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.clearButton.addEventListener('click', async () => {
    await callbacks.clearAllData();
    uiState.setViewMode('log');
    fullRender();
  });

  // --- Data export ---
~~~~~
~~~~~javascript.new
  dom.clearButton.addEventListener('click', async () => {
    await callbacks.clearAllData();
    uiState.setViewMode('log');
    fullRender();
  });

  dom.deleteBackupButton.addEventListener('click', async () => {
    if (confirm('【确认】将永久删除 LocalStorage 中的旧版备份数据。此操作不可撤销，确定要继续吗？')) {
      await callbacks.deleteV6Backup();
      fullRender();
    }
  });

  // --- Data export ---
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    }
  };

  const uiCallbacks = {
    ...appCallbacks,
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    downloadAllData,
  };
~~~~~
~~~~~javascript.new
    }
  };

  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
  };

  const uiCallbacks = {
    ...appCallbacks,
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    downloadAllData,
    deleteV6Backup,
  };
~~~~~

### 下一步建议
- **IndexedDB 性能测试**：虽然当前对 `STORE_MESSAGES` 进行 `getAll()` 来计算大小在常规量级（几万条）下很快，但如果消息条数达到数十万级别，这可能会造成设置页面开启时的明显卡顿。未来可以考虑在保存时增量计算并存储 size，而不是每次渲染时全量计算。
- **备份建议**：既然现在用户可以删除 LS 备份了，建议在删除按钮旁边增加一个醒目的“下载备份 JSON”提醒，确保用户在彻底清理旧格式数据前有一次最后的手动导出机会。
