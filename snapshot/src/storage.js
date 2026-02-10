import { CONFIG_KEY, OLD_STORAGE_KEY_V4, SELF_NAME_KEY, STORAGE_KEY_V5 } from './constants.js';

/**
 * 核心存储驱动，封装对 localStorage 的直接访问。
 */
export const storage = {
  // --- 聊天记录 (Messages) ---
  getMessages() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_V5);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('[Storage] 解析 V5 存档失败:', e);
      return {};
    }
  },

  saveMessages(messagesObject) {
    try {
      localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(messagesObject));
    } catch (e) {
      console.error('[Storage] 保存 V5 存档失败:', e);
    }
  },

  clearAllMessages() {
    localStorage.removeItem(STORAGE_KEY_V5);
  },

  /** 返回存档的原始字节大小（用于容量计算） */
  getMessagesRawSize() {
    const data = localStorage.getItem(STORAGE_KEY_V5);
    return data ? new Blob([data]).size : 0;
  },

  // --- 配置 (Config) ---
  getConfig() {
    const defaultCfg = { pageSize: 1000 };
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      return stored ? { ...defaultCfg, ...JSON.parse(stored) } : defaultCfg;
    } catch (e) {
      return defaultCfg;
    }
  },

  saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  },

  // --- 用户身份 (SelfName) ---
  getSelfName() {
    return localStorage.getItem(SELF_NAME_KEY) || '';
  },

  setSelfName(name) {
    localStorage.setItem(SELF_NAME_KEY, name.trim());
  },

  // --- 迁移相关 (Legacy V4) ---
  getLegacyV4Data() {
    const data = localStorage.getItem(OLD_STORAGE_KEY_V4);
    return data ? JSON.parse(data) : null;
  },

  removeLegacyV4Data() {
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
  },
};