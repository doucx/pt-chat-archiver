你的分析非常深刻，直接指出了当前架构的一个潜在死结：

1.  **V5->V6 的隐患**：现有的 `migrateV5toV6` 确实是先 `saveAllV6` 后 `removeV5Data`。如果 `target` 是 LocalStorage，这会导致存储占用暂时翻倍，在接近上限时必挂无疑。
2.  **V5->V7 的盲区**：目前的 `main.js` 初始化了 IndexedDB。但是 `IndexedDBAdapter.loadAllV5` 返回的是 `null`（因为它只管 IDB）。这意味着：**如果不修改逻辑，现在的系统在 IDB 模式下根本检测不到 V5 的旧数据！**

我们需要实现一个 **“内存直通车” (In-Memory Pipeline)**：
- **读取端**: 强制使用 `LocalStorageAdapter` 读取 V5。
- **转换端**: 在内存中合并/转换。
- **写入端**: 使用当前的 `storage` (即 IDB) 直接写入 V7 格式。
- **清理端**: 调用读取端的 `removeV5Data` 清理 LS。

这样，中间状态（V6 Object）只存在于内存中，直接落盘为 V7（IDB），完全绕过了 LocalStorage 的写入限制。

## [WIP] test: 实现 V5 直通 V7 的内存迁移管道测试

### 用户需求
1.  修复在 IDB 模式下无法检测到 V5 数据的问题。
2.  实现 V5 -> V7 的直接迁移，无需在 LocalStorage 中创建临时的 V6 副本，从而避开 5MB 限制。
3.  确保即使 LocalStorage 处于只读状态（满），也能完成迁移并删除旧数据。

### 评论
这个重构一石二鸟：既解决了 IDB 模式下的遗留数据发现问题，又解决了存储空间瓶颈问题。我们不再需要专门的“内存适配器”，因为 JavaScript 的对象（Object）本身就是内存适配器。我们要做的只是正确地“导流”。

### 目标
1.  创建一个新的测试文件 `tests/migrations_pipeline.test.js`。
2.  测试用例 1：断言在 LS 写入失败（模拟满）的情况下，V5 数据能成功迁移到 Mock 的 IDB Adapter 中，并从 LS 中清除。
3.  测试用例 2：验证 `migrateV5toV6` 能够正确分离 Source（读取/删除）和 Target（写入）。

### 基本原理
我们将重构 `migrateV5toV6` 函数签名，使其接受 `sourceAdapter` 和 `targetAdapter`。
- `sourceAdapter` (LS): 负责 `loadAllV5` 和 `removeV5Data`。
- `targetAdapter` (IDB): 负责 `saveAllV6` (内部自动转为 V7)。

### 标签
#intent/refine #flow/ready #priority/high #comp/runtime #concept/state #scope/core #ai/instruct #task/domain/storage #task/object/migration-pipeline #task/action/test-logic #task/state/continue

---

### Script

#### Acts 1: 创建 V5->V7 管道测试

~~~~~act
write_file
tests/migrations_pipeline.test.js
~~~~~
~~~~~javascript
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
~~~~~

### 下一步建议

1.  **运行测试**: `npm test tests/migrations_pipeline.test.js`。预期会失败，因为目前的 `migrateV5toV6` 函数签名和内部逻辑不支持 source/target 分离（它只接受一个 `storage` 参数并在其上同时调用 save 和 remove）。
2.  **重构实现**:
    - 修改 `migrateV5toV6` 的签名，接受 `(source, target, ...)`。
    - 更新 `src/migrations.js` 中的逻辑，使用 `source.removeV5Data()` 和 `target.saveAllV6()`。
    - 更新 `checkAndTriggerInteractiveMigrations`，在其中显式实例化 `new LocalStorageAdapter()` 作为 source，并将当前的 `storage` (IDB) 作为 target。
3.  **验证**: 再次运行测试。
