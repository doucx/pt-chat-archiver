好的，我明白了。你希望清理项目中所有用于处理旧版本（V4、V5、V6）数据合并、迁移和恢复的逻辑。这标志着项目已经完全过渡到了 V7（IndexedDB）时代，不再需要这些向后兼容的辅助代码。

我将执行以下重构：
1. **移除 `MigrationManager`**: 删除 `src/migrations.js` 文件，并移除所有文件中对它的引用。
2. **简化存储初始化**: 移除 `StorageManager.init` 中自动触发迁移的逻辑。
3. **清理适配器方法**: 从 `IndexedDBAdapter` 和 `LocalStorageAdapter` 中删除仅用于旧版迁移的 stub 方法和备份管理方法。
4. **精简 UI 界面**: 移除 `ConfigPanel.jsx` 中关于“发现残留数据”和“兼容性清理”的按钮和逻辑，同时清理 `src/ui/index.jsx` 中的相关 Handler。

## [WIP] refactor: 移除所有旧版本数据合并与恢复逻辑

### 用户需求
移除代码库中用于从 V4、V5 和 V6 版本迁移数据的所有遗留逻辑和 UI 功能。

### 评论
这是一个非常及时的代码清理。移除这些“脚手架”代码可以显著降低 `StorageManager` 和 `ConfigPanel` 的复杂度。既然 V7 版本已经稳定，这些一次性的迁移逻辑已经完成了它们的使命。

### 目标
1.  删除 `src/migrations.js` 物理文件。
2.  移除 `src/storage/index.js` 中的静默迁移步骤。
3.  移除 `src/ui/components/ConfigPanel.jsx` 中的迁移和备份清理 UI。
4.  移除 `src/constants.js` 中不再使用的旧版存储 Key。
5.  移除 `src/main.js` 中进入服务器时触发的交互式迁移检查。

### 基本原理
我们将从最外层的 `main.js` 和 UI 层开始剥离引用，然后深入到存储层删除底层的迁移方法，最后删除整个 `MigrationManager` 工具类。我们将保留 `loadAllV6` 和 `saveAllV6` 接口，因为它们仍被作为通用的数据导出/导入格式使用。

### 标签
#intent/refine #flow/ready #priority/medium #comp/storage #comp/ui #comp/engine #scope/core #scope/ux #ai/refine #task/domain/refactoring #task/object/legacy-migration-removal #task/action/cleanup #task/state/begin

---

### Script

#### Acts 1: 清理常量定义

移除不再使用的 V4 和 V5 存储 Key。保留 V6 相关的 Key，因为 LS 适配器仍可能作为降级方案运行。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
// 全局配置与状态
export const STORAGE_KEY_V6 = 'chatLogArchive_v6';
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
~~~~~
~~~~~javascript.new
// 全局配置与状态
export const STORAGE_KEY_V6 = 'chatLogArchive_v6';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
~~~~~

#### Acts 2: 简化存储适配器

移除适配器中仅用于满足旧版迁移需求的接口方法。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  async getTotalMessageCount() {
    try {
      const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
      return await this._req(store.count());
    } catch (e) {
      return 0;
    }
  }

  // --- Legacy Support ---
  loadAllV4() {
    return Promise.resolve(null);
  }
  removeV4Data() {
    return Promise.resolve();
  }
  loadAllV5() {
    return Promise.resolve(null);
  }
  removeV5Data() {
    return Promise.resolve();
  }
}
~~~~~
~~~~~javascript.new
  async getTotalMessageCount() {
    try {
      const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
      return await this._req(store.count());
    } catch (e) {
      return 0;
    }
  }
}
~~~~~

~~~~~act
patch_file
src/storage/local-storage.adapter.js
~~~~~
~~~~~javascript.old
  getRawSize() {
    const dataV6 = localStorage.getItem(STORAGE_KEY_V6) || '';
    const dataV5 = localStorage.getItem(STORAGE_KEY_V5) || '';
    const size = new Blob([dataV6]).size + new Blob([dataV5]).size;
    return Promise.resolve(size);
  }

  // --- Legacy Migration Support ---

  loadAllV4() {
    const data = localStorage.getItem(OLD_STORAGE_KEY_V4);
    return Promise.resolve(data ? JSON.parse(data) : null);
  }

  removeV4Data() {
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
    return Promise.resolve();
  }

  loadAllV5() {
    const data = localStorage.getItem(STORAGE_KEY_V5);
    return Promise.resolve(data ? JSON.parse(data) : null);
  }

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
~~~~~javascript.new
  getRawSize() {
    const dataV6 = localStorage.getItem(STORAGE_KEY_V6) || '';
    const size = new Blob([dataV6]).size;
    return Promise.resolve(size);
  }
}
~~~~~

#### Acts 3: 简化 StorageManager

移除 `init` 过程中的 `MigrationManager` 调用及相关 proxy 方法。

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
import { MigrationManager } from '../migrations.js';
import { IndexedDBAdapter } from './indexed-db-adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
~~~~~
~~~~~javascript.new
import { IndexedDBAdapter } from './indexed-db-adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
~~~~~
~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
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

      await MigrationManager.runSilentMigrations(sourceAdapter, targetAdapter);

      this.adapter = targetAdapter;
    } else {
~~~~~
~~~~~javascript.new
  async init(useIndexedDB = false) {
    // 如果已经初始化过且没有强制切换，则直接返回
    if (this.adapter && !useIndexedDB) return;

    if (useIndexedDB) {
      const targetAdapter = new IndexedDBAdapter();
      await targetAdapter.init();
      this.adapter = targetAdapter;
    } else {
~~~~~
~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
  getTotalMessageCount() {
    if (this.adapter?.getTotalMessageCount) {
      return this.adapter.getTotalMessageCount();
    }
    return Promise.resolve(0);
  }

  loadAllV4() {
    return this.adapter.loadAllV4();
  }
~~~~~

#### Acts 4: 清理 UI 与 Main 逻辑

从 UI 组件和主入口中移除所有合并/恢复逻辑。

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
import { useEffect, useRef, useState } from 'preact/hooks';
import { UI_FEEDBACK_DURATION } from '../../constants.js';
import { MigrationManager } from '../../migrations.js';
import { getStorageUsageInMB, storageManager } from '../../storage/index.js';
import { serverList } from '../store/dataStore';
~~~~~
~~~~~javascript.new
import { useEffect, useRef, useState } from 'preact/hooks';
import { UI_FEEDBACK_DURATION } from '../../constants.js';
import { getStorageUsageInMB, storageManager } from '../../storage/index.js';
import { serverList } from '../store/dataStore';
~~~~~
~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
export function ConfigPanel({ callbacks }) {
  const [usage, setUsage] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const [legacy, setLegacy] = useState({ v4: false, v5: false, v6: false });
  const [hasBackup, setHasBackup] = useState(false);
  const [feedback, setFeedback] = useState({});

  const triggerFeedback = (key) => {
~~~~~
~~~~~javascript.new
export function ConfigPanel({ callbacks }) {
  const [usage, setUsage] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const [feedback, setFeedback] = useState({});

  const triggerFeedback = (key) => {
~~~~~
~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
  // 挂载时刷新统计信息
  useEffect(() => {
    getStorageUsageInMB().then(setUsage);
    storageManager.getTotalMessageCount().then(setMsgCount);
    setLegacy(MigrationManager.scanForLegacyData());
    setHasBackup(storageManager.hasV6Backup());
  }, []);

  const handleUpdate = (key, val) => {
~~~~~
~~~~~javascript.new
  // 挂载时刷新统计信息
  useEffect(() => {
    getStorageUsageInMB().then(setUsage);
    storageManager.getTotalMessageCount().then(setMsgCount);
  }, []);

  const handleUpdate = (key, val) => {
~~~~~
~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
        </div>
      </div>

      {(legacy.v4 || legacy.v5 || legacy.v6) && (
        <div
          class="config-group"
          style={{
            marginTop: '10px',
            padding: '10px',
            background: 'rgba(200, 150, 50, 0.1)',
            border: '1px dashed var(--color-warning)',
          }}
        >
          <div style={{ fontWeight: 'bold', color: 'var(--color-warning)', marginBottom: '4px' }}>
            发现残留数据!
          </div>
          <div class="info-text-dim" style={{ marginBottom: '8px' }}>
            检测到旧版本数据尚未合并。
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              class="log-archive-ui-button"
              style={{ backgroundColor: 'var(--color-warning)', color: '#000', flexGrow: 1 }}
              onClick={() => callbacks.recoverLegacyData(viewingServer.value)}
            >
              尝试合并
            </button>
            <button
              type="button"
              class="log-archive-ui-button"
              style={{ backgroundColor: 'var(--color-danger)', color: '#fff', flexGrow: 1 }}
              onClick={callbacks.clearLegacyData}
            >
              放弃并清理
            </button>
          </div>
        </div>
      )}

      {hasBackup && (
        <div class="config-group" style={{ marginTop: '10px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>兼容性清理</div>
          <button
            type="button"
            class="log-archive-ui-button"
            onClick={async () => (await callbacks.deleteV6Backup()) && triggerFeedback('delBackup')}
          >
            {feedback.delBackup ? '✅ 备份已清理' : '删除旧版 LocalStorage 备份'}
          </button>
          <div class="info-text-dim" style={{ marginTop: '4px', fontSize: '0.8em' }}>
            迁移至新数据库后生成的备份文件，删除可释放浏览器 LocalStorage 空间。
          </div>
        </div>
      )}

      <div
        class="config-group"
~~~~~
~~~~~javascript.new
        </div>
      </div>

      <div
        class="config-group"
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
import { batch, effect, untracked } from '@preact/signals';
import { render } from 'preact';
import { UI_MESSAGES } from '../constants.js';
import { MigrationManager } from '../migrations.js';
import { storageManager } from '../storage/index.js';
import { App } from './App.jsx';
~~~~~
~~~~~javascript.new
import { batch, effect, untracked } from '@preact/signals';
import { render } from 'preact';
import { UI_MESSAGES } from '../constants.js';
import { storageManager } from '../storage/index.js';
import { App } from './App.jsx';
~~~~~
~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
    }
  };

  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
    return true;
  };

  const recoverLegacyData = async (targetServer) => {
    try {
      const rawState = await dataAdapter.getAllData();
      const newState = await MigrationManager.recoverAndMergeAll(rawState, targetServer);
      await appCallbacks.saveMessagesToStorage(newState);
      refreshView();
      return true;
    } catch (err) {
      console.error('[Recovery] Failed:', err);
      alert('恢复失败，详情请查看控制台。');
      return false;
    }
  };

  const clearLegacyData = async () => {
    MigrationManager.clearAllLegacyData();
    return true;
  };

  const ioManager = createIOManager({ dataAdapter, appCallbacks, refreshView });

  const uiCallbacks = {
    ...appCallbacks,
    ...ioManager,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    deleteMessages: appCallbacks.deleteMessages,
    clearAllData,
    deleteV6Backup,
    recoverLegacyData,
    clearLegacyData,
  };
~~~~~
~~~~~javascript.new
    }
  };

  const ioManager = createIOManager({ dataAdapter, appCallbacks, refreshView });

  const uiCallbacks = {
    ...appCallbacks,
    ...ioManager,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    deleteMessages: appCallbacks.deleteMessages,
    clearAllData,
  };
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import './ui/style.css';
import { scanAllDuplicatesAsync } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
import { EngineStates, engineMachine } from './machine.js';
import { MigrationManager } from './migrations.js';
import { ChatMonitor } from './monitor.js';
import {
~~~~~
~~~~~javascript.new
import './ui/style.css';
import { scanAllDuplicatesAsync } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
import { EngineStates, engineMachine } from './machine.js';
import { ChatMonitor } from './monitor.js';
import {
~~~~~
~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
        if (uiControls) {
          uiControls.updateRecordingStatus(
            detectedServerName,
            chatMonitor ? chatMonitor.currentActiveChannel : null,
          );
        }

        // 检查并触发交互式迁移 (如 v5 -> v6)
        const currentState = await storageManager.loadAllV6();
        await MigrationManager.checkAndTriggerInteractiveMigrations(
          storageManager,
          server,
          currentState,
          (newState) => {
            if (uiControls.setState) uiControls.setState(newState);
          },
        );
      }
    };
~~~~~
~~~~~javascript.new
        if (uiControls) {
          uiControls.updateRecordingStatus(
            detectedServerName,
            chatMonitor ? chatMonitor.currentActiveChannel : null,
          );
        }
      }
    };
~~~~~

#### Acts 5: 删除物理文件

最后，删除不再使用的 `migrations.js`。

~~~~~act
delete_file
src/migrations.js
~~~~~

### 下一步建议
- **代码导出格式对齐**: 虽然我们删除了 V6 的迁移逻辑，但目前的 `loadAllV6` 仍然返回 V6 时代的嵌套 JSON 对象。我们可以考虑将其重命名为 `exportFullArchive` 或类似名称，以消除“V6”字样带来的困惑。
- **LocalStorage 适配器审查**: 既然核心数据已经迁移到 IndexedDB，可以进一步审查 `LocalStorageAdapter` 的存在意义。如果不再需要作为生产环境的回退，可以将其移动到测试套件中作为 Mock 使用。
