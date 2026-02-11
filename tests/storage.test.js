import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_KEY, SELF_NAME_KEY, STORAGE_KEY_V6 } from '../src/constants.js';
import { storage } from '../src/storage.js';

describe('Storage Module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('应当能正确保存和读取 V6 消息数据', () => {
    const mockData = { 'Main Server': { Local: [{ content: 'hello' }] } };
    storage.saveV6Messages(mockData);
    expect(storage.getV6Messages()).toEqual(mockData);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_V6))).toEqual(mockData);
  });

  it('应当能正确管理配置项并提供默认值', () => {
    const defaultConfig = storage.getConfig();
    expect(defaultConfig.pageSize).toBe(1000);

    const newConfig = { pageSize: 50, autoSaveInterval: 60 };
    storage.saveConfig(newConfig);
    expect(storage.getConfig()).toEqual(newConfig);
  });

  it('应当能保存和检索用户昵称', () => {
    storage.setSelfName('TestUser  ');
    expect(storage.getSelfName()).toBe('TestUser'); // 验证 trim
    expect(localStorage.getItem(SELF_NAME_KEY)).toBe('TestUser');
  });

  it('清空操作应当移除相关 key', () => {
    storage.saveV6Messages({ a: 1 });
    storage.clearAllMessages();
    expect(storage.getV6Messages()).toEqual({});
  });
});
