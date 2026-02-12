import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY_V5, STORAGE_KEY_V6 } from '../src/constants.js';
import { MigrationManager } from '../src/migrations.js';
import { storageManager } from '../src/storage/index.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(async () => {
    localStorage.clear();
    await storageManager.init();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', async () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    const currentV6 = {};
    const result = await MigrationManager.migrateV5toV6(
      storageManager,
      v5Data,
      'Main Server',
      currentV6,
    );

    expect(result['Main Server'].Local[0].content).toBe('msg');

    const storedV6 = JSON.parse(localStorage.getItem(STORAGE_KEY_V6));
    expect(storedV6['Main Server'].Local[0].content).toBe('msg');
    expect(localStorage.getItem(STORAGE_KEY_V5)).toBeNull();
  });

  it('V6 -> V7: 即使 LocalStorage 备份因容量不足失败，也应确保数据成功写入 IndexedDB', async () => {
    const largeData = { 'LargeServer': { 'Local': [{ content: 'some large content' }] } };
    localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(largeData));

    // 1. 模拟 localStorage.setItem 在尝试写入备份键时抛出错误
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      if (key.endsWith('_backup')) {
        throw new Error('QuotaExceededError: NS_ERROR_DOM_QUOTA_REACHED');
      }
      // 正常的 setItem 逻辑（在 jsdom 环境中）
      localStorage[key] = value;
    });

    const mockTarget = {
      constructor: { name: 'IndexedDBAdapter' },
      saveAllV6: vi.fn().mockResolvedValue(),
      saveConfig: vi.fn().mockResolvedValue(),
      setSelfName: vi.fn().mockResolvedValue(),
    };

    const mockSource = {
      loadAllV6: vi.fn().mockResolvedValue(largeData),
      getConfig: vi.fn().mockResolvedValue({}),
      getSelfName: vi.fn().mockResolvedValue(''),
    };

    // 2. 执行迁移
    // 【注意】当前代码逻辑下，此处会抛出错误导致测试失败，符合 TDD 预期
    await MigrationManager.migrateV6ToV7(mockSource, mockTarget);

    // 3. 断言：即使备份失败，IDB 写入也应该已经完成
    expect(mockTarget.saveAllV6).toHaveBeenCalledWith(largeData);

    // 4. 清理
    setItemSpy.mockRestore();
  });
});
