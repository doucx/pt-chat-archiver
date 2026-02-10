import { STORAGE_KEY_V6 } from './constants.js';

/**
 * 存储抽象层，统一管理本地持久化。
 */
export const storage = {
  /**
   * 加载 v6 数据。
   */
  load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_V6);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('[Storage] 加载 v6 数据失败:', e);
      return {};
    }
  },

  /**
   * 保存 v6 数据。
   */
  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[Storage] 保存 v6 数据失败:', e);
      return false;
    }
  },

  /**
   * 清空所有 v6 存档。
   */
  clear() {
    localStorage.removeItem(STORAGE_KEY_V6);
  },

  /**
   * 读取任意键的原始数据 (主要用于迁移)。
   */
  getRaw(key) {
    return localStorage.getItem(key);
  },

  /**
   * 移除任意键 (主要用于迁移后的清理)。
   */
  removeRaw(key) {
    localStorage.removeItem(key);
  },

  /**
   * 获取当前 v6 数据占用的 MB 数。
   */
  getUsageInMB() {
    const data = localStorage.getItem(STORAGE_KEY_V6);
    if (!data) return 0;
    const sizeInBytes = new Blob([data]).size;
    return sizeInBytes / (1024 * 1024);
  }
};