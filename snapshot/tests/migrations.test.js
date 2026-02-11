import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MigrationManager } from '../src/migrations.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', () => {
    const v5Data = { "Local": [{ content: "msg" }] };
    MigrationManager.migrateV5toV6(v5Data, "Main Server");
    const v6Data = JSON.parse(localStorage.getItem('chat_v6_key') || localStorage.getItem('chatLogArchive_v6'));
    expect(v6Data["Main Server"].Local[0].content).toBe("msg");
  });
});