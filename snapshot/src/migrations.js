import { storage } from './storage.js';
import { mergeAndDeduplicateMessages } from './state.js';

/**
 * 版本迁移管理器
 * 处理从旧版本到新版本的数据演进逻辑
 */
export const MigrationManager = {
  /**
   * 执行启动时的静默迁移
   */
  runSilentMigrations() {
    this.migrateV4toV5();
  },

  /**
   * v4 -> v5: 时间戳标准化
   * 将旧的本地字符串时间转换为标准的 ISO 8601 格式。
   */
  migrateV4toV5() {
    try {
      const oldData = storage.getLegacyV4Data();
      if (!oldData) return;

      console.log('[Migration] 检测到 v4 数据，执行静默迁移...');
      const newData = {};

      for (const channel in oldData) {
        newData[channel] = oldData[channel].map((msg) => {
          const newMsg = { ...msg };
          try {
            // v4 存储的是本地时间字符串，需要处理后转 ISO
            const localDate = new Date(msg.time.replace(/-/g, '/'));
            newMsg.time = localDate.toISOString();
          } catch (e) {
            newMsg.time = new Date().toISOString();
          }
          newMsg.is_historical = true;
          return newMsg;
        });
      }

      storage.saveMessages(newData);
      storage.removeLegacyV4Data();
      console.info('[Migration] v4 -> v5 迁移成功。');
    } catch (error) {
      console.error('[Migration] v4 迁移过程中出现错误:', error);
    }
  },

  /**
   * v5 -> v6: 多服务器支持
   * v5 数据是全局单服务器的，v6 需要将其映射到具体的服务器。
   */
  migrateV5toV6(v5Data, targetServer) {
    console.log(`[Migration] 正在执行 V5 到 V6 迁移，目标服务器: ${targetServer}`);
    const v6Data = storage.getV6Messages();

    if (!v6Data[targetServer]) {
      // 如果目标服务器没数据，直接搬迁
      v6Data[targetServer] = v5Data;
    } else {
      // 如果已经有数据，则执行频道级的智能合并
      for (const channel in v5Data) {
        v6Data[targetServer][channel] = mergeAndDeduplicateMessages(
          v6Data[targetServer][channel] || [],
          v5Data[channel],
        );
      }
    }

    storage.saveV6Messages(v6Data);
    storage.removeV5Data();
    console.info('[Migration] V5 -> V6 迁移完成，旧数据已移除。');
    return v6Data;
  },

  /**
   * 检查并触发交互式迁移
   * @param {string} serverName - 当前检测到的服务器名
   * @param {Function} onMigrated - 迁移成功后的回调函数，用于更新内存状态和UI
   */
  checkAndTriggerInteractiveMigrations(serverName, onMigrated) {
    if (!serverName) return;

    // 1. 处理 V5 -> V6
    const v5Data = storage.getMessages(); // 获取 V5 存档
    if (v5Data && Object.keys(v5Data).length > 0) {
      const confirmMsg = `【数据升级】检测到您的旧版本聊天存档。

是否将其迁移到当前服务器 [${serverName}]？

注意：如果存档不属于此服务器，请点击“取消”，切换到正确的服务器后再执行此操作。`;

      if (confirm(confirmMsg)) {
        const newV6State = this.migrateV5toV6(v5Data, serverName);
        onMigrated(newV6State);
      }
    }
    
    // 2. 将来可以在这里添加 V6 -> V7 的检查逻辑
  },
};