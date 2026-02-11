import {
  CONFIG_KEY,
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_KEY_V6,
} from '../constants.js';

/**
 * An adapter that implements the IStorageAdapter interface for localStorage.
 * All methods are wrapped in Promises to simulate an async API.
 * @implements {IStorageAdapter}
 */
export class LocalStorageAdapter {
  init() {
    return Promise.resolve();
  }

  loadAllV6() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_V6);
      return Promise.resolve(data ? JSON.parse(data) : {});
    } catch (e) {
      console.error('[Storage] Failed to parse V6 archive:', e);
      return Promise.resolve({});
    }
  }

  saveAllV6(state) {
    try {
      localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(state));
    } catch (e) {
      console.error('[Storage] Failed to save V6 archive:', e);
    }
    return Promise.resolve();
  }

  getConfig() {
    const defaultCfg = { pageSize: 1000, autoSaveInterval: 30 };
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      return Promise.resolve(stored ? { ...defaultCfg, ...JSON.parse(stored) } : defaultCfg);
    } catch (e) {
      return Promise.resolve(defaultCfg);
    }
  }

  saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return Promise.resolve();
  }

  getSelfName() {
    return Promise.resolve(localStorage.getItem(SELF_NAME_KEY) || '');
  }

  setSelfName(name) {
    localStorage.setItem(SELF_NAME_KEY, name.trim());
    return Promise.resolve();
  }

  clearAllData() {
    localStorage.removeItem(STORAGE_KEY_V6);
    localStorage.removeItem(STORAGE_KEY_V5);
    return Promise.resolve();
  }

  getRawSize() {
    const dataV6 = localStorage.getItem(STORAGE_KEY_V6) || '';
    const dataV5 = localStorage.getItem(STORAGE_KEY_V5) || '';
    const size = new Blob([dataV6]).size + new Blob([dataV5]).size;
    return Promise.resolve(size);
  }

  // --- Legacy Migration Support ---

  loadAllV4() {
    const data = localStorage.getItem(OLD_STORAGE_KEY_V4);
    return Promise.resolve(data ? JSON.parse(data) : null);
  }

  removeV4Data() {
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
    return Promise.resolve();
  }

  loadAllV5() {
    const data = localStorage.getItem(STORAGE_KEY_V5);
    return Promise.resolve(data ? JSON.parse(data) : null);
  }

  removeV5Data() {
    localStorage.removeItem(STORAGE_KEY_V5);
    return Promise.resolve();
  }
}
