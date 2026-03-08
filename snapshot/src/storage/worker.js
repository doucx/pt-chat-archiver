import { IndexedDBAdapter } from './indexed-db-adapter.js';

const adapter = new IndexedDBAdapter();

self.onmessage = async (e) => {
  const { id, method, args } = e.data;
  try {
    if (typeof adapter[method] === 'function') {
      const result = await adapter[method](...args);
      self.postMessage({ id, result });
    } else {
      throw new Error(`Method ${method} not found in adapter`);
    }
  } catch (error) {
    self.postMessage({ id, error: error.message || error.toString() });
  }
};