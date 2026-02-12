你的分析非常及时。由于 v7 引入了 IndexedDB，虽然我们在 `init` 时尝试了静默迁移，但复杂的浏览器环境或用户中途关闭页面可能导致迁移不完整，使得部分数据遗留在 `localStorage` 中。

我将添加一个“旧版数据恢复中心”功能。它将：
1. **自动检测**：在设置页面实时检测 `localStorage` 中是否存在 v4, v5, v6 的残留数据。
2. **多级恢复**：
   - 对于有结构的 **v6** 数据，直接按服务器和频道进行智能合并。
   - 对于无服务器结构的 **v4/v5** 数据，允许用户将其合并到当前正在查看的服务器。
3. **智能合并**：使用现有的 `mergeAndDeduplicateMessages` 逻辑，确保旧数据被追加到现有历史的“头部”，并自动处理重叠部分。

以下是实现该功能的计划。

## [WIP] feat: 添加旧版 localStorage 数据手动恢复与合并功能

### 用户需求
用户在升级到 v7 (IndexedDB) 后，部分旧数据可能仍残留在 `localStorage` (v4/v5/v6) 中。需要一个手动入口来扫描这些残留并将其合并到当前的 IndexedDB 存档中。

### 评论
这是一个关键的补救功能，能有效解决迁移失败导致的“数据孤岛”问题。通过在 UI 中提供明确的反馈和手动触发机制，用户可以安全地找回丢失的历史。

### 目标
1. 在 `migrations.js` 中实现全面的 `localStorage` 扫描和数据转换逻辑。
2. 更新 UI 模板，在设置页面新增“数据恢复”分组。
3. 实现合并算法，确保旧数据合并到现有数据的开头（时间线前端）。
4. 提供合并后的自动清理机制（删除已恢复的 localStorage 键）。

### 基本原理
我们在 `migrations.js` 中定义 `scanForLegacyData` 来检查所有已知的旧版 Key。合并时，我们将旧数据作为 `mergeAndDeduplicateMessages` 的第一个参数（作为基准历史），将现有的 v7 数据作为第二个参数。这样，`state.js` 的合并逻辑会自动处理可能的重叠，并将新记录接在旧记录之后。

### 标签
#intent/build #flow/ready #priority/high #comp/docs #comp/ui #concept/navigation #scope/ux #ai/brainstorm #task/domain/storage #task/object/legacy-recovery #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 扩展迁移逻辑支持手动恢复

我们需要在 `migrations.js` 中添加扫描残留数据、格式标准化以及合并到当前状态的函数。

~~~~~act
patch_file
src/migrations.js
~~~~~
~~~~~javascript.old
import { STORAGE_KEY_V6 } from './constants.js';
import { mergeAndDeduplicateMessages } from './state.js';
import { LocalStorageAdapter } from './storage/local-storage.adapter.js';

/**
 * 版本迁移管理器
 * 处理从旧版本到新版本的数据演进逻辑
 */
export const MigrationManager = {
  /**
   * 执行启动时的静默迁移 (V6 -> V7)
   * @param {import('./storage/local-storage.adapter.js').LocalStorageAdapter} sourceAdapter
   * @param {import('./storage/indexed-db-adapter.js').IndexedDBAdapter} targetAdapter
   */
  async runSilentMigrations(sourceAdapter, targetAdapter) {
    // 检查是否需要从 V6 (LocalStorage) 迁移到 V7 (IndexedDB)
    const v6DataExists = localStorage.getItem(STORAGE_KEY_V6) !== null;

    // 如果源数据存在，且目标适配器是 IndexedDB，则尝试迁移
    if (v6DataExists && targetAdapter.constructor.name === 'IndexedDBAdapter') {
      console.info('[Migration] 检测到旧版 V6 数据，准备迁移至 IndexedDB...');
      await this.migrateV6ToV7(sourceAdapter, targetAdapter);
    }
  },

  /**
   * V6 (LocalStorage) -> V7 (IndexedDB)
~~~~~
~~~~~javascript.new
import { OLD_STORAGE_KEY_V4, STORAGE_KEY_V5, STORAGE_KEY_V6 } from './constants.js';
import { mergeAndDeduplicateMessages } from './state.js';
import { LocalStorageAdapter } from './storage/local-storage.adapter.js';

/**
 * 版本迁移管理器
 * 处理从旧版本到新版本的数据演进逻辑
 */
export const MigrationManager = {
  /**
   * 扫描 localStorage 中是否存在旧版残留数据
   */
  scanForLegacyData() {
    return {
      v4: localStorage.getItem(OLD_STORAGE_KEY_V4) !== null,
      v5: localStorage.getItem(STORAGE_KEY_V5) !== null,
      v6: localStorage.getItem(STORAGE_KEY_V6) !== null,
    };
  },

  /**
   * 执行手动恢复合并逻辑
   * @param {object} currentV7State - 当前内存中的 V7 状态
   * @param {string} targetServer - v4/v5 数据归属的目标服务器
   * @returns {Promise<object>} - 合并后的新状态
   */
  async recoverAndMergeAll(currentV7State, targetServer) {
    const source = new LocalStorageAdapter();
    let mergedState = { ...currentV7State };

    // 1. 处理 V6 (具有服务器结构)
    if (localStorage.getItem(STORAGE_KEY_V6)) {
      const v6Data = await source.loadAllV6();
      for (const server in v6Data) {
        if (!mergedState[server]) {
          mergedState[server] = v6Data[server];
        } else {
          // 将旧数据合并到当前数据的前面
          for (const channel in v6Data[server]) {
            mergedState[server][channel] = mergeAndDeduplicateMessages(
              v6Data[server][channel], // Legacy goes first
              mergedState[server][channel] || [],
            );
          }
        }
      }
      localStorage.removeItem(STORAGE_KEY_V6);
    }

    // 2. 处理 V5 (无服务器结构)
    if (localStorage.getItem(STORAGE_KEY_V5)) {
      const v5Data = await source.loadAllV5();
      if (v5Data && targetServer) {
        if (!mergedState[targetServer]) mergedState[targetServer] = {};
        for (const channel in v5Data) {
          mergedState[targetServer][channel] = mergeAndDeduplicateMessages(
            v5Data[channel],
            mergedState[targetServer][channel] || [],
          );
        }
      }
      localStorage.removeItem(STORAGE_KEY_V5);
    }

    // 3. 处理 V4
    if (localStorage.getItem(OLD_STORAGE_KEY_V4)) {
      const v4Data = await source.loadAllV4();
      if (v4Data && targetServer) {
        if (!mergedState[targetServer]) mergedState[targetServer] = {};
        // v4 结构与 v5 类似
        for (const channel in v4Data) {
          mergedState[targetServer][channel] = mergeAndDeduplicateMessages(
            v4Data[channel],
            mergedState[targetServer][channel] || [],
          );
        }
      }
      localStorage.removeItem(OLD_STORAGE_KEY_V4);
    }

    return mergedState;
  },

  /**
   * 执行启动时的静默迁移 (V6 -> V7)
   * @param {import('./storage/local-storage.adapter.js').LocalStorageAdapter} sourceAdapter
   * @param {import('./storage/indexed-db-adapter.js').IndexedDBAdapter} targetAdapter
   */
  async runSilentMigrations(sourceAdapter, targetAdapter) {
    // 检查是否需要从 V6 (LocalStorage) 迁移到 V7 (IndexedDB)
    const v6DataExists = localStorage.getItem(STORAGE_KEY_V6) !== null;

    // 如果源数据存在，且目标适配器是 IndexedDB，则尝试迁移
    if (v6DataExists && targetAdapter.constructor.name === 'IndexedDBAdapter') {
      console.info('[Migration] 检测到旧版 V6 数据，准备迁移至 IndexedDB...');
      await this.migrateV6ToV7(sourceAdapter, targetAdapter);
    }
  },

  /**
   * V6 (LocalStorage) -> V7 (IndexedDB)
~~~~~

#### Acts 2: 更新 UI 模板增加恢复区域

在设置面板中添加一个新的 `Legacy Recovery` 区域。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
            <div id="log-archive-delete-backup-group" class="config-group" style="margin-top: auto; display: none;">
                <label>兼容性清理</label>
                <button id="log-archive-delete-backup-button" class="log-archive-ui-button">删除旧版 LocalStorage 备份</button>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    迁移至新数据库后生成的备份文件，删除可释放浏览器 LocalStorage 空间。
                </div>
            </div>

            <div class="config-group" style="margin-top: 10px; border-top: 1px dashed #444; padding-top: 20px;">
~~~~~
~~~~~javascript.new
            <div id="log-archive-legacy-recovery-group" class="config-group" style="margin-top: 10px; display: none; padding: 10px; background: rgba(200, 150, 50, 0.1); border: 1px dashed var(--color-warning);">
                <label style="color: var(--color-warning);">发现残留数据!</label>
                <div id="log-archive-legacy-info" class="info-text-dim" style="margin-bottom: 8px;">
                    检测到旧版本 (v4/v5/v6) 的聊天记录尚未合并到当前数据库。
                </div>
                <button id="log-archive-recover-button" class="log-archive-ui-button" style="background-color: var(--color-warning); color: #000;">尝试合并旧数据</button>
                <div class="info-text-dim" style="margin-top: 6px; font-size: 0.8em;">
                    此操作将把 localStorage 中的旧记录合并到当前存档的开头，并自动处理重复项。
                </div>
            </div>

            <div id="log-archive-delete-backup-group" class="config-group" style="margin-top: auto; display: none;">
                <label>兼容性清理</label>
                <button id="log-archive-delete-backup-button" class="log-archive-ui-button">删除旧版 LocalStorage 备份</button>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    迁移至新数据库后生成的备份文件，删除可释放浏览器 LocalStorage 空间。
                </div>
            </div>

            <div class="config-group" style="margin-top: 10px; border-top: 1px dashed #444; padding-top: 20px;">
~~~~~

#### Acts 3: 实现渲染与事件绑定逻辑

我们需要让渲染器检测旧数据是否存在并显示该分组，并在 `events.js` 中处理点击逻辑。

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    configMsgCount: document.getElementById('log-archive-config-msg-count'),
    deleteBackupGroup: document.getElementById('log-archive-delete-backup-group'),
    deleteBackupButton: document.getElementById('log-archive-delete-backup-button'),
    cleanButton: document.getElementById('log-archive-clean-button'),
~~~~~
~~~~~javascript.new
    configMsgCount: document.getElementById('log-archive-config-msg-count'),
    legacyRecoveryGroup: document.getElementById('log-archive-legacy-recovery-group'),
    legacyInfoText: document.getElementById('log-archive-legacy-info'),
    recoverButton: document.getElementById('log-archive-recover-button'),
    deleteBackupGroup: document.getElementById('log-archive-delete-backup-group'),
    deleteBackupButton: document.getElementById('log-archive-delete-backup-button'),
    cleanButton: document.getElementById('log-archive-clean-button'),
~~~~~

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
import { generateStatisticsText } from '../analysis.js';
import { getStorageUsageInMB, storageManager } from '../storage/index.js';
import { formatISOTimeForDisplay } from '../utils.js';
~~~~~
~~~~~javascript.new
import { generateStatisticsText } from '../analysis.js';
import { MigrationManager } from '../migrations.js';
import { getStorageUsageInMB, storageManager } from '../storage/index.js';
import { formatISOTimeForDisplay } from '../utils.js';
~~~~~
~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
      storageManager.getTotalMessageCount().then((count) => {
        dom.configMsgCount.textContent = `存档消息总数: ${count.toLocaleString()} 条`;
      });

      // 检查是否有备份
      if (storageManager.hasV6Backup()) {
~~~~~
~~~~~javascript.new
      storageManager.getTotalMessageCount().then((count) => {
        dom.configMsgCount.textContent = `存档消息总数: ${count.toLocaleString()} 条`;
      });

      // 检查是否有旧版残留数据
      const legacy = MigrationManager.scanForLegacyData();
      if (legacy.v4 || legacy.v5 || legacy.v6) {
        dom.legacyRecoveryGroup.style.display = 'block';
        const versions = [];
        if (legacy.v4) versions.push('v4');
        if (legacy.v5) versions.push('v5');
        if (legacy.v6) versions.push('v6');
        dom.legacyInfoText.textContent = `检测到旧版本 (${versions.join('/')}) 的残留数据。`;
      } else {
        dom.legacyRecoveryGroup.style.display = 'none';
      }

      // 检查是否有备份
      if (storageManager.hasV6Backup()) {
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.deleteBackupButton.addEventListener('click', async () => {
    if (
      confirm('【确认】将永久删除 LocalStorage 中的旧版备份数据。此操作不可撤销，确定要继续吗？')
    ) {
      await callbacks.deleteV6Backup();
      fullRender();
    }
  });

  // --- Data export ---
~~~~~
~~~~~javascript.new
  dom.deleteBackupButton.addEventListener('click', async () => {
    if (
      confirm('【确认】将永久删除 LocalStorage 中的旧版备份数据。此操作不可撤销，确定要继续吗？')
    ) {
      await callbacks.deleteV6Backup();
      fullRender();
    }
  });

  dom.recoverButton.addEventListener('click', async () => {
    const { viewingServer } = uiState.getState();
    const confirmMsg = `【数据恢复】此操作将尝试从 localStorage 提取旧数据并合并到当前数据库。

- v6 数据将按服务器自动归类。
- v4/v5 数据将合并到您当前查看的服务器: [${viewingServer}]。

建议在此操作前先“下载备份”以防万一。是否继续？`;

    if (confirm(confirmMsg)) {
      await callbacks.recoverLegacyData(viewingServer);
      fullRender();
    }
  });

  // --- Data export ---
~~~~~

#### Acts 4: 在 `ui/index.js` 中公开恢复回调

最后，我们需要在 UI 入口处实现实际调用 `MigrationManager` 并持久化的回调。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
import { storageManager } from '../storage/index.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
~~~~~
~~~~~javascript.new
import { MigrationManager } from '../migrations.js';
import { storageManager } from '../storage/index.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
  };

  const uiCallbacks = {
    ...appCallbacks,
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    importAllData,
    downloadAllData,
    deleteV6Backup,
  };
~~~~~
~~~~~javascript.new
  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
  };

  const recoverLegacyData = async (targetServer) => {
    try {
      const newState = await MigrationManager.recoverAndMergeAll(appState, targetServer);

      // 1. 更新全局引用
      if (appCallbacks.replaceState) {
        appCallbacks.replaceState(newState);
      }
      appState = newState;

      // 2. 立即持久化到 v7 (IndexedDB)
      await appCallbacks.saveMessagesToStorage(appState);

      alert('数据恢复合并完成！已自动清理旧版残留。');
    } catch (err) {
      console.error('[Recovery] Failed:', err);
      alert('恢复失败，详情请查看控制台。');
    }
  };

  const uiCallbacks = {
    ...appCallbacks,
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    importAllData,
    downloadAllData,
    deleteV6Backup,
    recoverLegacyData,
  };
~~~~~

### 下一步建议
- **回归测试**：在多种 `localStorage` 污染场景下测试恢复逻辑，确保数据顺序（旧在前，新在后）正确。
- **UI 引导**：如果用户尚未切换到正确的服务器，在点击恢复按钮时，考虑再次提醒他们当前的 `targetServer` 可能是错误的。
- **版本号更新**：将 `package.json` 的版本号提升到 `7.1.0`，因为增加了一个重要的用户功能。
