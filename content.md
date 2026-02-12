## [WIP] fix: 优化启动时迁移逻辑以防止数据覆盖

### 错误分析
当前 `runSilentMigrations` 逻辑过于激进。当 `localStorage` 中存在残留的 v6 数据（可能源于之前的迁移失败或多标签页操作）时，它会在启动时无条件地将其读取并**覆盖**写入到 IndexedDB。

如果用户已经在 IndexedDB (v7) 中积累了新数据，这种覆盖行为会导致 v7 数据丢失。

此外，用户需要在启动时获知存在残留数据，并有机会选择“合并”而不是“被覆盖”。

### 用户需求
1.  **安全性**：当 v7 数据库（IndexedDB）中已有数据时，禁止启动时的静默迁移覆盖操作。
2.  **交互性**：在游戏启动并检测到服务器后，如果发现残留的旧版数据，应主动询问用户是否合并。

### 评论
这是一个关键的数据安全补丁。它将“破坏性覆盖”转变为“安全的增量合并”，并利用了我们刚刚构建的通用恢复逻辑。

### 目标
1.  修改 `runSilentMigrations`：增加前置检查，仅当目标数据库为空时才执行静默迁移。
2.  重构 `checkAndTriggerInteractiveMigrations`：使其利用 `recoverAndMergeAll` 通用逻辑，不仅处理 v5，也能处理 v6 残留，并在检测到时引导用户合并。

### 基本原理
通过 `targetAdapter.getTotalMessageCount()` 判断目标库状态。
-   **为空**：维持原有的静默迁移便利性（针对首次升级用户）。
-   **非空**：跳过静默迁移，将控制权交给后续的 `checkAndTriggerInteractiveMigrations`。
-   **交互检查**：在 `main.js` 检测到服务器后触发。如果此时 LS 中仍有数据（说明静默迁移被跳过或未执行），则弹出确认框，调用 `recoverAndMergeAll` 将旧数据追加合并到现有 v7 数据中。

### 标签
#intent/fix #flow/ready #priority/critical #comp/runtime #concept/state #scope/core #ai/instruct #task/domain/storage #task/object/migration-logic #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 增强迁移管理器的安全性与交互逻辑

我们将修改 `migrations.js`。
1.  在 `runSilentMigrations` 中增加非空检查。
2.  重写 `checkAndTriggerInteractiveMigrations`，使其不再局限于 v5，而是通用的“残留数据扫描与合并”。

~~~~~act
patch_file
src/migrations.js
~~~~~
~~~~~javascript.old
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
  /**
   * 执行启动时的静默迁移 (V6 -> V7)
   * 仅当目标数据库为空时执行，以防止覆盖现有数据。
   * @param {import('./storage/local-storage.adapter.js').LocalStorageAdapter} sourceAdapter
   * @param {import('./storage/indexed-db-adapter.js').IndexedDBAdapter} targetAdapter
   */
  async runSilentMigrations(sourceAdapter, targetAdapter) {
    // 检查是否需要从 V6 (LocalStorage) 迁移到 V7 (IndexedDB)
    const v6DataExists = localStorage.getItem(STORAGE_KEY_V6) !== null;

    // 如果源数据存在，且目标适配器是 IndexedDB
    if (v6DataExists && targetAdapter.constructor.name === 'IndexedDBAdapter') {
      // 安全检查：只有当 IDB 为空时才执行静默覆盖迁移
      const currentCount = await targetAdapter.getTotalMessageCount();
      if (currentCount > 0) {
        console.warn(
          `[Migration] 目标数据库中已有 ${currentCount} 条消息，跳过静默迁移以防止覆盖。旧数据保留在 LocalStorage 中等待手动合并。`,
        );
        return;
      }

      console.info('[Migration] 检测到旧版 V6 数据且目标库为空，准备静默迁移至 IndexedDB...');
      await this.migrateV6ToV7(sourceAdapter, targetAdapter);
    }
  },

  /**
   * V6 (LocalStorage) -> V7 (IndexedDB)
~~~~~

~~~~~act
patch_file
src/migrations.js
~~~~~
~~~~~javascript.old
  /**
   * 检查并触发交互式迁移
   * @param {object} targetStorage - 目标存储实例 (StorageManager)
   * @param {string} serverName - 当前检测到的服务器名
   * @param {object} currentV6State - 当前内存中的 V6 状态
   * @param {Function} onMigrated - 迁移成功后的回调函数
   */
  async checkAndTriggerInteractiveMigrations(
    targetStorage,
    serverName,
    currentV6State,
    onMigrated,
  ) {
    if (!serverName) return;

    // 1. 处理 V5 -> V6
    // 强制创建一个 LocalStorageAdapter 作为 Source，以确保即使 target 是 IDB 也能读到旧数据
    const sourceStorage = new LocalStorageAdapter();
    const v5Data = await sourceStorage.loadAllV5();

    if (v5Data && Object.keys(v5Data).length > 0) {
      const confirmMsg = `【数据升级】检测到您的旧版本聊天存档。

是否将其迁移到当前服务器 [${serverName}]？

注意：如果存档不属于此服务器，请点击“取消”，切换到正确的服务器后再执行此操作。`;

      if (confirm(confirmMsg)) {
        const newV6State = await this.migrateV5toV6(
          sourceStorage,
          targetStorage,
          v5Data,
          serverName,
          currentV6State,
        );
        onMigrated(newV6State);
      }
    }

    // 2. 将来可以在这里添加 V6 -> V7 的检查逻辑
  },
};
~~~~~
~~~~~javascript.new
  /**
   * 检查并触发交互式迁移/恢复
   * 在进入游戏服务器后调用，检查是否有任何未合并的残留数据。
   * @param {object} targetStorage - 目标存储实例 (StorageManager)
   * @param {string} serverName - 当前检测到的服务器名
   * @param {object} currentV7State - 当前内存中的 V7 状态
   * @param {Function} onMigrated - 迁移成功后的回调函数
   */
  async checkAndTriggerInteractiveMigrations(
    targetStorage,
    serverName,
    currentV7State,
    onMigrated,
  ) {
    if (!serverName) return;

    // 扫描所有遗留数据
    const legacy = this.scanForLegacyData();
    if (!legacy.v4 && !legacy.v5 && !legacy.v6) return;

    const versions = [];
    if (legacy.v6) versions.push('v6');
    if (legacy.v5) versions.push('v5');
    if (legacy.v4) versions.push('v4');

    const confirmMsg = `【数据恢复】检测到本地存储中有旧版残留数据 (${versions.join(
      '/',
    )})。

这可能是因为之前的迁移被跳过，或者数据来自旧版本备份。
当前数据库已启用 (v7)，建议将这些旧数据合并进来。

- v6 数据：将按原服务器结构自动合并。
- v5/v4 数据：将合并到当前服务器 [${serverName}]。

是否立即执行合并？
(点击“取消”将保留旧数据，您稍后可以在设置中手动处理)`;

    if (confirm(confirmMsg)) {
      try {
        console.info('[Migration] 用户确认执行交互式合并...');
        const newState = await this.recoverAndMergeAll(currentV7State, serverName);
        
        // 立即持久化合并后的结果到 v7
        await targetStorage.saveAllV6(newState);
        
        onMigrated(newState);
        alert('合并成功！旧版残留数据已清理。');
      } catch (e) {
        console.error('[Migration] 合并失败:', e);
        alert(`合并过程中发生错误: ${e.message}\n数据未变更。`);
      }
    }
  },
};
~~~~~

### 下一步建议
我们已经构建了非常健壮的迁移和恢复机制。
下一步建议进行一次全面的**代码清理 (Cleanup)**。
- 移除 `migrations.js` 中不再被引用的旧函数（如 `migrateV5toV6`，现在逻辑已被 `recoverAndMergeAll` 囊括，或者保留但标记为 deprecated）。
- 检查 `LocalStorageAdapter` 中是否还有冗余的旧代码。
- 统一 `Act` 和 `Instruction` 的命名规范。
