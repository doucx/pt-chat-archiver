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
