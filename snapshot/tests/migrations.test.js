import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY_V5 } from '../src/constants.js';
import { MigrationManager } from '../src/migrations.js';
import { storageManager } from '../src/storage/index.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(async () => {
    localStorage.clear();
    // The migration functions call storageManager methods, so it must be initialized.
    await storageManager.init();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', async () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    const currentV6 = {};

    // Mock the IndexedDBAdapter's save method to write to localStorage for this test
    storageManager.adapter.saveAllV6 = (state) => {
      localStorage.setItem('MIGRATION_TEST_DB', JSON.stringify(state));
      return Promise.resolve();
    };

    const result = await MigrationManager.migrateV5toV6(v5Data, 'Main Server', currentV6);

    expect(result['Main Server'].Local[0].content).toBe('msg');

    const storedV6 = JSON.parse(localStorage.getItem('MIGRATION_TEST_DB'));
    expect(storedV6['Main Server'].Local[0].content).toBe('msg');
    expect(localStorage.getItem(STORAGE_KEY_V5)).toBeNull();
  });
});
