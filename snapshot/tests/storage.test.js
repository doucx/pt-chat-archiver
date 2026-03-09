import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_KEY, SELF_NAME_KEY, STORAGE_KEY_V6 } from '../src/constants.js';
import { storageManager } from '../src/storage/index.js';

describe('Storage Module (Async Manager)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('应当能正确保存和读取 V6 消息数据', async () => {
    await storageManager.init(); // 必须显式初始化
    const mockData = { 'Main Server': { Local: [{ content: 'hello' }] } };
    await storageManager.saveAllV6(mockData);
    const loadedData = await storageManager.loadAllV6();
    expect(loadedData).toEqual(mockData);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_V6))).toEqual(mockData);
  });

  it('应当能正确管理配置项并提供默认值', async () => {
    await storageManager.init();
    const defaultConfig = await storageManager.getConfig();
    expect(defaultConfig.pageSize).toBe(1000);

    const newConfig = { pageSize: 50, autoSaveInterval: 60, initDebounceMs: 150 };
    await storageManager.saveConfig(newConfig);
    const loadedConfig = await storageManager.getConfig();
    expect(loadedConfig).toEqual(newConfig);
  });

  it('应当能保存和检索用户昵称', async () => {
    await storageManager.init();
    await storageManager.setSelfName('TestUser  ');
    const name = await storageManager.getSelfName();
    expect(name).toBe('TestUser'); // 验证 trim
    expect(localStorage.getItem(SELF_NAME_KEY)).toBe('TestUser');
  });

  it('清空操作应当移除相关 key', async () => {
    await storageManager.init();
    await storageManager.saveAllV6({ a: 1 });
    await storageManager.clearAllData();
    const loadedData = await storageManager.loadAllV6();
    expect(loadedData).toEqual({});
  });
});
