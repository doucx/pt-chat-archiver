import { mergeAndDeduplicateMessages } from './state.js';
import { STORAGE_KEY_V6 } from './constants.js';

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

      // 3. 验证与清理 (暂不删除，改为重命名备份，以防万一)
      const raw = localStorage.getItem(STORAGE_KEY_V6);
      localStorage.setItem(`${STORAGE_KEY_V6}_backup`, raw);
      localStorage.removeItem(STORAGE_KEY_V6);
      
      console.info('[Migration] V6 -> V7 迁移成功！旧数据已备份为 _backup');
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
   * v5 -> v6: 多服务器支持
   * v5 数据是全局单服务器的，v6 需要将其映射到具体的服务器。
   */
  async migrateV5toV6(v5Data, targetServer, currentV6Data) {
    console.log(`[Migration] 正在执行 V5 到 V6 迁移，目标服务器: ${targetServer}`);

    if (!currentV6Data[targetServer]) {
      // 如果目标服务器没数据，直接搬迁
      currentV6Data[targetServer] = v5Data;
    } else {
      // 如果已经有数据，则执行频道级的智能合并
      for (const channel in v5Data) {
        currentV6Data[targetServer][channel] = mergeAndDeduplicateMessages(
          currentV6Data[targetServer][channel] || [],
          v5Data[channel],
        );
      }
    }

    await storageManager.saveAllV6(currentV6Data);
    await storageManager.removeV5Data();
    console.info('[Migration] V5 -> V6 迁移完成，旧数据已移除。');
    return currentV6Data;
  },

  /**
   * 检查并触发交互式迁移
   * @param {string} serverName - 当前检测到的服务器名
   * @param {object} currentV6State - The current in-memory V6 state.
   * @param {Function} onMigrated - 迁移成功后的回调函数，用于更新内存状态和UI
   */
  async checkAndTriggerInteractiveMigrations(serverName, currentV6State, onMigrated) {
    if (!serverName) return;

    // 1. 处理 V5 -> V6
    const v5Data = await storageManager.loadAllV5();
    if (v5Data && Object.keys(v5Data).length > 0) {
      const confirmMsg = `【数据升级】检测到您的旧版本聊天存档。

是否将其迁移到当前服务器 [${serverName}]？

注意：如果存档不属于此服务器，请点击“取消”，切换到正确的服务器后再执行此操作。`;

      if (confirm(confirmMsg)) {
        const newV6State = await this.migrateV5toV6(v5Data, serverName, currentV6State);
        onMigrated(newV6State);
      }
    }

    // 2. 将来可以在这里添加 V6 -> V7 的检查逻辑
  },
};
