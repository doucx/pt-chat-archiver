import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MigrationManager } from '../../src/migrations.js';
import { storage } from '../../src/storage.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('V4 -> V5: 应当能将本地时间字符串转换为 ISO 格式', () => {
    const v4Data = {
      "Local": [{ time: "2023-10-01 12:00:00", content: "hello" }]
    };
    localStorage.setItem('chatLogArchive_v4', JSON.stringify(v4Data));
    
    MigrationManager.migrateV4toV5();
    
    const v5Data = JSON.parse(localStorage.getItem('chatLogArchive_v5'));
    expect(new Date(v5Data.Local[0].time).toISOString()).toBeDefined();
    expect(localStorage.getItem('chatLogArchive_v4')).toBeNull();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', () => {
    const v5Data = { "Local": [{ content: "msg" }] };
    MigrationManager.migrateV5toV6(v5Data, "Main Server");
    
    const v6Data = JSON.parse(localStorage.getItem('chatLogArchive_v6'));
    expect(v6Data["Main Server"].Local[0].content).toBe("msg");
    expect(localStorage.getItem('chatLogArchive_v5')).toBeNull();
  });
});