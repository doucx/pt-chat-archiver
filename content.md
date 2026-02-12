这是一个非常合理的补充。对于那些已经确认不再需要旧版数据（或者已经手动导出过）的用户，提供一个“一键清理”的选项不仅能释放浏览器存储空间（`localStorage` 的 5MB 限制非常宝贵），还能消除设置页面中那个显眼的警告。

我将在“旧版数据恢复中心”中添加一个“放弃并清理旧数据”的按钮，并确保它有足够的二次确认保护。

## [WIP] feat: 添加清理旧版 localStorage 残留数据的功能

### 用户需求
在检测到旧版残留数据时，除了合并外，用户应该有权选择直接删除这些数据，以保持存储环境的整洁并释放 `localStorage` 空间。

### 评论
控制权是用户体验的核心。通过提供删除选项，我们解决了“不想合并但警告一直存在”的困扰。这在逻辑上与“恢复”功能互补。

### 目标
1.  在 `MigrationManager` 中实现一键清理所有旧版 Key 的逻辑。
2.  在 UI 的恢复区域添加“放弃并清理”按钮。
3.  实现带有危险提示的二次确认逻辑。

### 基本原理
我们在 `MigrationManager` 中添加 `clearAllLegacyData` 函数。在 UI 层，我们将该按钮标记为危险操作（红色），并确保在用户确认后不仅清理 Key，还能立即触发 UI 刷新以隐藏恢复区域。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #concept/navigation #scope/ux #ai/brainstorm #task/domain/storage #task/object/legacy-cleanup #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 扩展迁移逻辑支持清理

在 `migrations.js` 中添加清理函数。

~~~~~act
patch_file
src/migrations.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
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
   * 清理所有旧版残留数据 Key
   */
  clearAllLegacyData() {
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
    localStorage.removeItem(STORAGE_KEY_V5);
    localStorage.removeItem(STORAGE_KEY_V6);
  },

  /**
   * 执行手动恢复合并逻辑
~~~~~

#### Acts 2: 更新 UI 模板增加清理按钮

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
                <div id="log-archive-legacy-info" class="info-text-dim" style="margin-bottom: 8px;">
                    检测到旧版本 (v4/v5/v6) 的聊天记录尚未合并到当前数据库。
                </div>
                <button id="log-archive-recover-button" class="log-archive-ui-button" style="background-color: var(--color-warning); color: #000;">尝试合并旧数据</button>
                <div class="info-text-dim" style="margin-top: 6px; font-size: 0.8em;">
                    此操作将把 localStorage 中的旧记录合并到当前存档的开头，并自动处理重复项。
                </div>
~~~~~
~~~~~javascript.new
                <div id="log-archive-legacy-info" class="info-text-dim" style="margin-bottom: 8px;">
                    检测到旧版本 (v4/v5/v6) 的聊天记录尚未合并到当前数据库。
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="log-archive-recover-button" class="log-archive-ui-button" style="background-color: var(--color-warning); color: #000; flex-grow: 1;">尝试合并旧数据</button>
                    <button id="log-archive-ignore-legacy-button" class="log-archive-ui-button" style="background-color: var(--color-danger); color: #fff; flex-grow: 1;">放弃并清理</button>
                </div>
                <div class="info-text-dim" style="margin-top: 6px; font-size: 0.8em;">
                    此操作将把 localStorage 中的旧记录合并到当前存档的开头，并自动处理重复项。
                </div>
~~~~~

#### Acts 3: 映射 DOM 元素并绑定事件

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    legacyRecoveryGroup: document.getElementById('log-archive-legacy-recovery-group'),
    legacyInfoText: document.getElementById('log-archive-legacy-info'),
    recoverButton: document.getElementById('log-archive-recover-button'),
    deleteBackupGroup: document.getElementById('log-archive-delete-backup-group'),
~~~~~
~~~~~javascript.new
    legacyRecoveryGroup: document.getElementById('log-archive-legacy-recovery-group'),
    legacyInfoText: document.getElementById('log-archive-legacy-info'),
    recoverButton: document.getElementById('log-archive-recover-button'),
    ignoreLegacyButton: document.getElementById('log-archive-ignore-legacy-button'),
    deleteBackupGroup: document.getElementById('log-archive-delete-backup-group'),
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
    if (confirm(confirmMsg)) {
      await callbacks.recoverLegacyData(viewingServer);
      fullRender();
    }
  });

  // --- Data export ---
~~~~~
~~~~~javascript.new
    if (confirm(confirmMsg)) {
      await callbacks.recoverLegacyData(viewingServer);
      fullRender();
    }
  });

  dom.ignoreLegacyButton.addEventListener('click', async () => {
    if (
      confirm(
        '【严重警告】此操作将永久删除 localStorage 中的旧版聊天记录残留。此操作不可撤销，确定要清理吗？',
      )
    ) {
      await callbacks.clearLegacyData();
      fullRender();
    }
  });

  // --- Data export ---
~~~~~

#### Acts 4: 在 UI 入口实现清理回调

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
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
~~~~~javascript.new
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

  const clearLegacyData = async () => {
    MigrationManager.clearAllLegacyData();
    alert('旧版残留数据已清理。');
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
    clearLegacyData,
  };
~~~~~

### 下一步建议
-   **存储配额监控**：随着数据迁移到 IndexedDB，建议在未来的版本中添加一个可视化的百分比进度条或磁盘配额检测，让用户知道 IndexedDB 的占用情况。
-   **自动静默清理**：如果在启动时静默迁移成功且验证无误，可以考虑在下一次启动时静默删除 `_backup` 键。
