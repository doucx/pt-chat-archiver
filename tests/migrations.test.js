import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY_V5, STORAGE_KEY_V6 } from '../src/constants.js';
import { MigrationManager } from '../src/migrations.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', async () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    const currentV6 = {};
    const result = await MigrationManager.migrateV5toV6(v5Data, 'Main Server', currentV6);

    expect(result['Main Server'].Local[0].content).toBe('msg');

    const storedV6 = JSON.parse(localStorage.getItem(STORAGE_KEY_V6));
    expect(storedV6['Main Server'].Local[0].content).toBe('msg');
    expect(localStorage.getItem(STORAGE_KEY_V5)).toBeNull();
  });
});
