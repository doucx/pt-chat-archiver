import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, DB_VERSION, STORE_MESSAGES } from '../../src/constants.js';
import { IndexedDBAdapter } from '../../src/storage/indexed-db-adapter.js';

// 简单的 Mock IDB 实现
const mockIDB = {
  open: vi.fn(),
};

global.indexedDB = mockIDB;

describe('IndexedDBAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new IndexedDBAdapter();
    vi.clearAllMocks();
  });

  it('init() 应当尝试打开正确的数据库版本', async () => {
    const mockRequest = {
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
      result: {
        objectStoreNames: { contains: () => false },
        createObjectStore: vi.fn(() => ({ createIndex: vi.fn() })),
      },
    };

    mockIDB.open.mockReturnValue(mockRequest);

    const initPromise = adapter.init();

    // 模拟成功回调
    mockRequest.onsuccess({ target: mockRequest });

    await initPromise;

    expect(mockIDB.open).toHaveBeenCalledWith(DB_NAME, DB_VERSION);
    expect(adapter.db).toBeDefined();
  });

  // 更多详细的逻辑测试依赖于复杂的 Mock，这里主要验证基本连接流程。
  // 在真实浏览器环境测试 (e.g. Playwright) 会更有效。
});
