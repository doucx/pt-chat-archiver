测试失败暴露了两个关键问题：一是 `getServers` 等方法尚未完成 `async/await` 改造，导致在测试中调用旧的回调逻辑时因 Mock 不全而崩溃；二是测试用例中对 `_req` 包装器的模拟不够精确（未模拟 `request.result` 属性）。

我将完成剩余核心方法的重构，并修复测试脚本。

## [WIP] fix(storage): 完成 IDB 适配器重构并修复单元测试

### 错误分析

1.  **TypeError (onsuccess of undefined)**: `putMessage` 的测试用例在末尾调用了 `adapter.getServers()`。由于 `getServers` 仍在使用旧的 `req.onsuccess` 风格，且测试中的 `mockIndex.openKeyCursor` 默认返回 `undefined`，导致赋值失败。
2.  **AssertionError (expected undefined to be 42)**: `_req` 包装器返回的是 `request.result`。在测试中，我们手动调用了 `onsuccess` 回调，但没有在 `mockReq` 对象上设置 `result` 属性，导致 Promise resolve 的结果为 `undefined`。

### 用户需求
1.  修复当前失效的单元测试。
2.  完成 `getServers`, `getChannels` 和 `getLatestMessages` 的 `async/await` 重构。

### 评论
存储层的重构必须彻底。半成品状态的重构（部分方法异步，部分方法回调）会增加系统的复杂性并导致测试脆弱。

### 目标
1.  重构 `getServers`, `getChannels`, `getLatestMessages` 为异步函数。
2.  修正测试用例中的 Mock 触发逻辑，确保符合 `IDBRequest` 的行为规范。

### 标签
#intent/fix #flow/ready #priority/high #comp/runtime #concept/state #task/domain/storage #task/object/indexed-db-adapter #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 重构剩余的查询方法为 `async/await`

我将更新 `getServers`, `getChannels` 和 `getLatestMessages`。由于它们涉及游标（Cursor），我将使用 `Promise` 包装游标循环。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  getServers() {
    if (this.cache.servers) return Promise.resolve([...this.cache.servers]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server');
      const req = index.openKeyCursor(null, 'nextunique');
      const servers = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          servers.push(cursor.key);
          cursor.continue();
        } else {
          this.cache.servers = servers;
          resolve([...servers]);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  getChannels(server) {
    if (!server) return Promise.resolve([]);
    if (this.cache.channels[server]) return Promise.resolve([...this.cache.channels[server]]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel');
      const range = IDBKeyRange.bound([server, ''], [server, '\uffff']);
      const req = index.openKeyCursor(range, 'nextunique');
      const channels = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          channels.push(cursor.key[1]);
          cursor.continue();
        } else {
          this.cache.channels[server] = channels;
          resolve([...channels]);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }
~~~~~
~~~~~javascript.new
  async getServers() {
    if (this.cache.servers) return [...this.cache.servers];
    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
    const index = store.index('server');
    const servers = [];

    await new Promise((resolve, reject) => {
      const req = index.openKeyCursor(null, 'nextunique');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          servers.push(cursor.key);
          cursor.continue();
        } else {
          this.cache.servers = servers;
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
    return [...servers];
  }

  async getChannels(server) {
    if (!server) return [];
    if (this.cache.channels[server]) return [...this.cache.channels[server]];
    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
    const index = store.index('server_channel');
    const range = IDBKeyRange.bound([server, ''], [server, '\uffff']);
    const channels = [];

    await new Promise((resolve, reject) => {
      const req = index.openKeyCursor(range, 'nextunique');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          channels.push(cursor.key[1]);
          cursor.continue();
        } else {
          this.cache.channels[server] = channels;
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
    return [...channels];
  }
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  getLatestMessages(server, channel, limit) {
    if (!server || !channel) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);

      const cursorReq = index.openCursor(range, 'prev');
      const messages = [];

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          messages.unshift(cursor.value); // 加入队首以保持升序
          if (messages.length < limit) {
            cursor.continue();
          } else {
            resolve(messages);
          }
        } else {
          resolve(messages);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }
~~~~~
~~~~~javascript.new
  async getLatestMessages(server, channel, limit) {
    if (!server || !channel) return [];
    const store = this._tx([STORE_MESSAGES], 'readonly').objectStore(STORE_MESSAGES);
    const index = store.index('server_channel_time');
    const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
    const messages = [];

    return new Promise((resolve, reject) => {
      const cursorReq = index.openCursor(range, 'prev');
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          messages.unshift(cursor.value);
          if (messages.length < limit) {
            cursor.continue();
          } else {
            resolve(messages);
          }
        } else {
          resolve(messages);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }
~~~~~

#### Acts 2: 修正单元测试中的 Mock 逻辑

我将更新测试脚本，确保 `onsuccess` 调用前正确设置了 `request.result`，并为游标方法提供基础的 Mock 返回值。

~~~~~act
patch_file
tests/storage/indexed-db.test.js
~~~~~
~~~~~javascript.old
    it('putMessage 应当调用 store.put 并更新缓存', async () => {
      const msg = { server: 'S1', channel: 'C1', content: 'hello', time: new Date().toISOString() };
      const mockReq = { onsuccess: null, onerror: null };
      mockStore.put.mockReturnValue(mockReq);

      const promise = adapter.putMessage(msg);
      mockReq.onsuccess({ target: { result: 'ok' } });
      await promise;

      expect(mockDb.transaction).toHaveBeenCalledWith([STORE_MESSAGES], 'readwrite');
      expect(mockStore.put).toHaveBeenCalledWith(expect.objectContaining({ content: 'hello' }));
      // 验证缓存是否更新
      const servers = await adapter.getServers();
      expect(servers).toContain('S1');
    });
~~~~~
~~~~~javascript.new
    it('putMessage 应当调用 store.put 并更新缓存', async () => {
      const msg = { server: 'S1', channel: 'C1', content: 'hello', time: new Date().toISOString() };
      const mockReq = { onsuccess: null, onerror: null, result: null };
      mockStore.put.mockReturnValue(mockReq);

      // 预设 getServers 会用到的游标 Mock，防止 TypeError
      mockIndex.openKeyCursor.mockReturnValue({ onsuccess: null });

      const promise = adapter.putMessage(msg);
      mockReq.result = 'ok';
      mockReq.onsuccess({ target: mockReq });
      await promise;

      expect(mockDb.transaction).toHaveBeenCalledWith([STORE_MESSAGES], 'readwrite');
      expect(mockStore.put).toHaveBeenCalledWith(expect.objectContaining({ content: 'hello' }));
      
      // 验证缓存是否更新
      const servers = await adapter.getServers();
      expect(servers).toContain('S1');
    });
~~~~~

~~~~~act
patch_file
tests/storage/indexed-db.test.js
~~~~~
~~~~~javascript.old
    it('getTotalMessageCount 应当返回 count 请求的结果', async () => {
      const mockReq = { onsuccess: null };
      mockStore.count.mockReturnValue(mockReq);

      const promise = adapter.getTotalMessageCount();
      mockReq.onsuccess({ target: { result: 42 } });
      const count = await promise;

      expect(count).toBe(42);
    });
~~~~~
~~~~~javascript.new
    it('getTotalMessageCount 应当返回 count 请求的结果', async () => {
      const mockReq = { onsuccess: null, result: null };
      mockStore.count.mockReturnValue(mockReq);

      const promise = adapter.getTotalMessageCount();
      mockReq.result = 42;
      mockReq.onsuccess({ target: mockReq });
      const count = await promise;

      expect(count).toBe(42);
    });
~~~~~

### 下一步建议
- **游标辅助化**: 对于 `getServers` 和 `getChannels` 这种“将游标内容收集为数组”的常见模式，可以在基类或工具类中提取一个 `_collectCursor(indexRequest, mapper)` 助手。
- **集成测试**: 单元测试验证了逻辑，但无法验证 `onupgradeneeded` 中的索引创建。建议后续引入一个基于真实浏览器（如 Playwright + fake-indexeddb）的集成测试。
