import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY_V5 } from '../src/constants.js';
import { MigrationManager } from '../src/migrations.js';
import { LocalStorageAdapter } from '../src/storage/local-storage.adapter.js';

describe('Migration Pipeline (V5 -> V7)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('应当支持源(LS)与目标(IDB)分离，从而在 LS 无法写入时完成迁移', async () => {
    // 1. 准备 V5 数据
    const v5Data = { 'OldChannel': [{ content: 'legacy msg', time: '2023-01-01T00:00:00.000Z' }] };
    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(v5Data));

    // 2. 模拟 LS 满（写入抛错），但允许删除
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    // spyOn removeItem to ensure it's called
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

    // 3. 构造适配器
    // Source: 真实的 LocalStorageAdapter (受限于上面的 mock)
    const sourceAdapter = new LocalStorageAdapter();
    
    // Target: Mock 的 IDB Adapter，模拟写入成功
    const targetAdapter = {
      saveAllV6: vi.fn().mockResolvedValue(),
      loadAllV6: vi.fn().mockResolvedValue({}), // 初始为空
    };

    // 4. 执行迁移
    // 我们期望 migrateV5toV6 能够接受分离的 source 和 target
    // 目标服务器: 'TargetServer'
    // 当前内存状态: {}
    const newV6State = await MigrationManager.migrateV5toV6(
      sourceAdapter, // Source: 负责读 V5 和 删 V5
      targetAdapter, // Target: 负责写 V6/V7
      v5Data,
      'TargetServer',
      {}
    );

    // 5. 断言
    
    // A. 内存状态更新正确
    expect(newV6State['TargetServer']['OldChannel'][0].content).toBe('legacy msg');

    // B. Target (IDB) 的保存方法被调用 (数据流向了 IDB)
    expect(targetAdapter.saveAllV6).toHaveBeenCalledWith(newV6State);

    // C. Source (LS) 的删除方法被调用 (旧数据被清理)
    // 即使 setItem 坏了，removeItem 应该工作
    expect(removeItemSpy).toHaveBeenCalledWith(STORAGE_KEY_V5);
  });
});