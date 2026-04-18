import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, DB_VERSION, STORE_CONFIG, STORE_MESSAGES } from '../../src/constants.js';
import { IndexedDBAdapter } from '../../src/storage/indexed-db-adapter.js';

describe('IndexedDBAdapter Logic Tests', () => {
  let adapter;
  let mockDb;
  let mockTx;
  let mockStore;
  let mockIndex;

  beforeEach(() => {
    // 构造深层 Mock 链
    mockIndex = {
      count: vi.fn(),
      getAll: vi.fn(),
      openCursor: vi.fn(),
      openKeyCursor: vi.fn(),
    };

    mockStore = {
      put: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn(),
      count: vi.fn(),
      clear: vi.fn(),
      delete: vi.fn(),
      index: vi.fn(() => mockIndex),
    };

    mockTx = {
      objectStore: vi.fn(() => mockStore),
      oncomplete: null,
      onerror: null,
      onabort: null,
    };

    mockDb = {
      transaction: vi.fn(() => mockTx),
      objectStoreNames: { contains: vi.fn(() => true) },
      createObjectStore: vi.fn(),
      close: vi.fn(),
    };

    adapter = new IndexedDBAdapter();
    adapter.db = mockDb; // 手动注入 Mock DB
    vi.clearAllMocks();
  });

  describe('基础增删改查逻辑', () => {
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

      // 验证缓存是否更新，由于 cache.servers 初始为 null 需要懒加载，
      // 我们这里直接验证 cache.channels 是否被正确填充
      expect(adapter.cache.channels.S1).toContain('C1');
    });

    it('deleteMessages 应当在事务完成后 resolve', async () => {
      const ids = ['id1', 'id2'];
      const promise = adapter.deleteMessages(ids);

      expect(mockStore.delete).toHaveBeenCalledTimes(2);
      expect(adapter.cache.counts).toEqual({}); // 验证缓存失效

      mockTx.oncomplete(); // 模拟事务完成
      await promise;
    });

    it('getServers 应当优先使用缓存', async () => {
      adapter.cache.servers = ['CachedServer'];
      const servers = await adapter.getServers();
      expect(servers).toEqual(['CachedServer']);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('getTotalMessageCount 应当返回 count 请求的结果', async () => {
      const mockReq = { onsuccess: null, result: null };
      mockStore.count.mockReturnValue(mockReq);

      const promise = adapter.getTotalMessageCount();
      mockReq.result = 42;
      mockReq.onsuccess({ target: mockReq });
      const count = await promise;

      expect(count).toBe(42);
    });
  });

  describe('配置管理逻辑', () => {
    it('getConfig 在数据库未命中时应当返回默认值', async () => {
      const mockReq = { onsuccess: null };
      mockStore.get.mockReturnValue(mockReq);

      const promise = adapter.getConfig();
      mockReq.onsuccess({ target: { result: null } });
      const config = await promise;

      expect(config.pageSize).toBe(1000);
      expect(config.statsLimit).toBe(5000);
    });

    it('saveConfig 应当将数据存入 STORE_CONFIG', async () => {
      const config = { pageSize: 50 };
      const mockReq = { onsuccess: null };
      mockStore.put.mockReturnValue(mockReq);

      const promise = adapter.saveConfig(config);
      mockReq.onsuccess({});
      await promise;

      expect(mockDb.transaction).toHaveBeenCalledWith([STORE_CONFIG], 'readwrite');
      expect(mockStore.put).toHaveBeenCalledWith({ key: 'main_config', value: config });
    });
  });
});
