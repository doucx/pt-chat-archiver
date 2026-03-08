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
   * 清理所有旧版残留数据 Key
   */
  clearAllLegacyData() {
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
    localStorage.removeItem(STORAGE_KEY_V5);
    localStorage.removeItem(STORAGE_KEY_V6);
  },

  /**
   * 执行手动恢复合并逻辑
   * @param {object} currentV7State - 当前内存中的 V7 状态
   * @param {string} targetServer - v4/v5 数据归属的目标服务器
   * @returns {Promise<object>} - 合并后的新状态
   */
  async recoverAndMergeAll(currentV7State, targetServer) {
    const source = new LocalStorageAdapter();
    const mergedState = { ...currentV7State };

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
   * 仅当目标数据库为空时执行，以防止覆盖现有数据。
   * @param {import('./storage/local-storage.adapter.js').LocalStorageAdapter} sourceAdapter
   * @param {import('./storage/indexed-db-adapter.js').IndexedDBAdapter} targetAdapter
   */
  async runSilentMigrations(sourceAdapter, targetAdapter) {
    // 检查是否需要从 V6 (LocalStorage) 迁移到 V7 (IndexedDB)
    const v6DataExists = localStorage.getItem(STORAGE_KEY_V6) !== null;

    // 如果源数据存在，且目标适配器是 IndexedDB 或 WorkerAdapter
    if (v6DataExists && (targetAdapter.constructor.name === 'IndexedDBAdapter' || targetAdapter.constructor.name === 'WorkerAdapter')) {
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
   * 读取旧的嵌套 JSON，利用 adapter 内部的 transformer 转换为扁平结构并写入 DB。
   */
  async migrateV6ToV7(source, target) {
    try {
      const v6State = await source.loadAllV6();
      if (!v6State || Object.keys(v6State).length === 0) return;

      const config = await source.getConfig();
      const selfName = await source.getSelfName();

      // 1. 迁移消息数据
      // target.saveAllV6 内部会调用 flattenV6State 将嵌套对象展平并生成 ID
      await target.saveAllV6(v6State);

      // 2. 迁移配置
      await target.saveConfig(config);
      await target.setSelfName(selfName);

      // 3. 验证与清理
      // 尝试备份旧数据，如果空间不足则跳过备份，优先保证迁移完成
      try {
        const raw = localStorage.getItem(STORAGE_KEY_V6);
        localStorage.setItem(`${STORAGE_KEY_V6}_backup`, raw);
        console.info('[Migration] V6 -> V7 迁移成功！旧数据已备份为 _backup');
      } catch (backupError) {
        console.warn(
          '[Migration] 备份旧数据失败 (可能是空间不足)，将跳过备份步骤直接清理旧数据以释放空间。',
          backupError,
        );
      }

      // 无论备份是否成功，只要新数据已安全写入 IDB，就移除旧 key
      // 这既防止了下次启动重复迁移，也能立即释放 LocalStorage 空间
      localStorage.removeItem(STORAGE_KEY_V6);
    } catch (e) {
      console.error('[Migration] V6 -> V7 迁移失败，已中止操作:', e);
      throw e; // 抛出异常阻断启动，防止数据不一致
    }
  },

  /**
   * v4 -> v5: 时间戳标准化
   * 将旧的本地字符串时间转换为标准的 ISO 8601 格式。
   */
  async migrateV4toV5() {
    // V5 is now deprecated and its data merged into V6, so this migration is a bit different.
    // It will migrate V4 to V5 format in memory, then that can be picked up by the V5->V6 migration.
    // However, for simplicity now, we assume V5 is gone. This function is kept for historical context
    // but a direct v4->v6 would be needed if v4 data is found. Let's assume v4 is long gone.
    // This is a no-op for now. A real implementation would need more care.
  },

  /**
   * v5 -> v6: 多服务器支持 (支持源/目标分离的管道迁移)
   * @param {object} source - 源存储适配器 (通常是 LocalStorageAdapter)
   * @param {object} target - 目标存储适配器 (通常是 IndexedDBAdapter 或 StorageManager)
   */
  async migrateV5toV6(source, target, v5Data, targetServer, currentV6Data) {
    console.log(`[Migration] 正在执行 V5 到 V6 迁移，目标服务器: ${targetServer}`);

    if (!currentV6Data[targetServer]) {
      currentV6Data[targetServer] = v5Data;
    } else {
      for (const channel in v5Data) {
        currentV6Data[targetServer][channel] = mergeAndDeduplicateMessages(
          currentV6Data[targetServer][channel] || [],
          v5Data[channel],
        );
      }
    }

    // 直接写入 Target (IDB)，无需经过 Source (LS) 的 save
    await target.saveAllV6(currentV6Data);
    // 从 Source (LS) 移除旧数据
    await source.removeV5Data();
    console.info('[Migration] V5 -> V6 迁移完成，旧数据已移除。');
    return currentV6Data;
  },

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

    const confirmMsg = `【数据恢复】检测到本地存储中有旧版残留数据 (${versions.join('/')})。

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
