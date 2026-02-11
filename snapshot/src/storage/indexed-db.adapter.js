import { flattenV6State, nestV7Messages } from '../data/transformer.js';
import { CONFIG_KEY, SELF_NAME_KEY, STORAGE_KEY_V5, STORAGE_KEY_V6 } from '../constants.js';

const DB_NAME = 'PTChatArchiverDB';
const DB_VERSION = 1;
const MESSAGES_STORE = 'messages';
const CONFIG_STORE = 'config'; // Future use, for now delegate to localStorage

/**
 * An adapter that implements the IStorageAdapter interface for IndexedDB.
 * @implements {IStorageAdapter}
 */
export class IndexedDBAdapter {
  /** @type {IDBDatabase | null} */
  db = null;

  init() {
    return new Promise((resolve, reject) => {
      if (this.db) return resolve();

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[Storage/IDB] Database error:', request.error);
        reject(new Error('Failed to open IndexedDB.'));
      };

      request.onupgradeneeded = (event) => {
        console.log('[Storage/IDB] Database upgrade needed.');
        const db = event.target.result;
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const store = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
          store.createIndex('by_channel', ['server', 'channel'], { unique: false });
          console.log(`[Storage/IDB] Object store "${MESSAGES_STORE}" created.`);
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('[Storage/IDB] Database initialized successfully.');
        resolve();
      };
    });
  }

  loadAllV6() {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized.'));

      const transaction = this.db.transaction(MESSAGES_STORE, 'readonly');
      const store = transaction.objectStore(MESSAGES_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(nestV7Messages(request.result));
      };
    });
  }

  saveAllV6(state) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized.'));

      const flatMessages = flattenV6State(state);
      const transaction = this.db.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      store.clear(); // Simple strategy for full-state save
      for (const msg of flatMessages) {
        store.put(msg);
      }
    });
  }

  // --- Configuration methods (delegated to localStorage for now) ---

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
    return new Promise((resolve, reject) => {
      // Clear legacy localStorage keys as well
      localStorage.removeItem(STORAGE_KEY_V6);
      localStorage.removeItem(STORAGE_KEY_V5);

      if (!this.db) return reject(new Error('Database not initialized.'));
      const transaction = this.db.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // Note: Accurately getting IDB size is complex. This is a placeholder.
  getRawSize() {
    return Promise.resolve(0); // Placeholder
  }

  // --- Legacy Migration Support ---
  // These are for the migration manager, not direct use
  loadAllV4() {
    return Promise.resolve(null); // Deprecated
  }
  removeV4Data() {
    return Promise.resolve(); // Deprecated
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