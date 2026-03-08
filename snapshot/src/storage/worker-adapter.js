import IDBWorker from './worker.js?worker&inline';

/**
 * 将对 IndexedDBAdapter 的调用代理到 Web Worker 中。
 * 提供与 IndexedDBAdapter 完全相同的 Promise 接口。
 */
export class WorkerAdapter {
  constructor() {
    this.worker = new IDBWorker();
    this.msgId = 0;
    this.pending = new Map();

    this.worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      if (this.pending.has(id)) {
        const { resolve, reject } = this.pending.get(id);
        if (error) {
          reject(new Error(error));
        } else {
          resolve(result);
        }
        this.pending.delete(id);
      }
    };

    this.worker.onerror = (err) => {
      console.error('[WorkerAdapter] Worker error:', err);
    };
  }

  _call(method, args = []) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, args });
    });
  }

  // --- 代理 IndexedDBAdapter 的所有公共方法 ---

  init() { return this._call('init'); }
  putMessage(msg) { return this._call('putMessage', [msg]); }
  putMessages(msgs) { return this._call('putMessages', [msgs]); }
  getServers() { return this._call('getServers'); }
  getChannels(server) { return this._call('getChannels', [server]); }
  getMessages(server, channel, page, pageSize) { return this._call('getMessages', [server, channel, page, pageSize]); }
  getLatestMessages(server, channel, limit) { return this._call('getLatestMessages', [server, channel, limit]); }
  loadAllV6() { return this._call('loadAllV6'); }
  saveAllV6(state) { return this._call('saveAllV6', [state]); }
  getConfig() { return this._call('getConfig'); }
  saveConfig(config) { return this._call('saveConfig', [config]); }
  getSelfName() { return this._call('getSelfName'); }
  setSelfName(name) { return this._call('setSelfName', [name]); }
  clearAllData() { return this._call('clearAllData'); }
  getRawSize() { return this._call('getRawSize'); }
  getTotalMessageCount() { return this._call('getTotalMessageCount'); }
  
  // --- 旧版遗留兼容接口 ---
  loadAllV4() { return this._call('loadAllV4'); }
  removeV4Data() { return this._call('removeV4Data'); }
  loadAllV5() { return this._call('loadAllV5'); }
  removeV5Data() { return this._call('removeV5Data'); }
}