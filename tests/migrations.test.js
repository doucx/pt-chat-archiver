import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MigrationManager } from '../src/migrations.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('V4 -> V5: 应当执行静默迁移并标准化时间戳', () => {
    const v4Data = {
      Local: [{ time: '2023-10-01 12:00:00', content: 'old_msg' }],
    };
    localStorage.setItem('chatLogArchive_v4', JSON.stringify(v4Data));

    MigrationManager.migrateV4toV5();

    const v5Data = JSON.parse(localStorage.getItem('chatLogArchive_v5'));
    expect(v5Data.Local[0].content).toBe('old_msg');
    // 验证时间戳已转为 ISO 格式（包含 T 和 Z）
    expect(v5Data.Local[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(localStorage.getItem('chatLogArchive_v4')).toBeNull();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    MigrationManager.migrateV5toV6(v5Data, 'Main Server');
    const v6Data = JSON.parse(
      localStorage.getItem('chat_v6_key') || localStorage.getItem('chatLogArchive_v6'),
    );
    expect(v6Data['Main Server'].Local[0].content).toBe('msg');
  });
});
