import { CONFIG_KEY, SELF_NAME_KEY, STORAGE_KEY_V6 } from '../constants.js';

/**
 * An adapter that implements the IStorageAdapter interface for localStorage.
 * All methods are wrapped in Promises to simulate an async API.
 * @implements {IStorageAdapter}
 */
export class LocalStorageAdapter {
  init() {
    return Promise.resolve();
  }

  exportFullArchive() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_V6);
      return Promise.resolve(data ? JSON.parse(data) : {});
    } catch (e) {
      console.error('[Storage] Failed to parse archive from LocalStorage:', e);
      return Promise.resolve({});
    }
  }

  overwriteFullArchive(state) {
    try {
      localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(state));
    } catch (e) {
      console.error('[Storage] Failed to save archive to LocalStorage:', e);
    }
    return Promise.resolve();
  }

  getConfig() {
    const defaultCfg = { pageSize: 1000, initDebounceMs: 150, cachePages: 5 };
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

  getLastServer() {
    return Promise.resolve(localStorage.getItem('chatLogArchive_lastServer'));
  }

  setLastServer(name) {
    localStorage.setItem('chatLogArchive_lastServer', name);
    return Promise.resolve();
  }

  clearAllData() {
    localStorage.removeItem(STORAGE_KEY_V6);
    return Promise.resolve();
  }

  getRawSize() {
    const dataV6 = localStorage.getItem(STORAGE_KEY_V6) || '';
    const size = new Blob([dataV6]).size;
    return Promise.resolve(size);
  }
}
