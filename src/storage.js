import {
  CONFIG_KEY,
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_KEY_V6,
} from './constants.js';

/**
 * 核心存储驱动，封装对 localStorage 的直接访问。
 */
export const storage = {
  // --- 聊天记录 (Messages) ---
  /** 加载 V6 数据 (Server -> Channel -> Messages) */
  getV6Messages() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_V6);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('[Storage] 解析 V6 存档失败:', e);
      return {};
    }
  },

  /** 保存 V6 数据 */
  saveV6Messages(messagesObject) {
    try {
      localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(messagesObject));
    } catch (e) {
      console.error('[Storage] 保存 V6 存档失败:', e);
    }
  },

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

  removeV5Data() {
    localStorage.removeItem(STORAGE_KEY_V5);
  },

  clearAllMessages() {
    localStorage.removeItem(STORAGE_KEY_V6);
    localStorage.removeItem(STORAGE_KEY_V5);
  },

  /** 返回存档的原始字节大小（用于容量计算） */
  getMessagesRawSize() {
    const dataV6 = localStorage.getItem(STORAGE_KEY_V6);
    if (dataV6) return new Blob([dataV6]).size;
    const dataV5 = localStorage.getItem(STORAGE_KEY_V5);
    return dataV5 ? new Blob([dataV5]).size : 0;
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
