你的分析非常准确。`localStorage` 的 5MB 限制在存档稍大时就会成为数据迁移的死胡同。目前的逻辑过于“洁癖”：如果备份这一步失败了，它就直接抛出异常中止了整个流程，导致数据甚至没能进入容量更大的 IndexedDB。

在 TDD 流程中，我们首先定义“即使环境不完美（LS 满了），核心目标（存入 IDB）也必须达成”这一断言。

## [WIP] test: 增加迁移过程对 LocalStorage 容量限制的容错测试

### 用户需求
当用户聊天存档接近或超过 5MB 时，从 `localStorage` (V4/V5/V6) 迁移到 `IndexedDB` (V7) 的过程不能因为 LS 无法创建备份副本而失败。系统应当优先保证数据进入 IndexedDB，即使 LS 的备份或清理操作报错。

### 评论
这是一个典型的“优雅降级”场景。`localStorage` 是我们要离开的旧时代，不应该让它的局限性阻碍用户走向支持海量数据的 IndexedDB 时代。在迁移逻辑中，备份应该是“Best Effort”（尽力而为），而非阻塞性的。

### 目标
1.  在 `tests/migrations.test.js` 中增加一个测试用例。
2.  模拟 `localStorage.setItem` 在尝试创建备份（`_backup`）时抛出 `QuotaExceededError`。
3.  断言迁移函数在这种情况下不应抛出异常，且目标适配器（IDB）的保存方法必须被正确调用。

### 基本原理
通过 `vi.spyOn(Storage.prototype, 'setItem')`，我们可以精确控制 LS 的行为。我们将模拟一种极端情况：数据已经大到可以通过 `getItem` 读取，但无法再通过 `setItem` 写入任何新内容（即备份）。

### 标签
#intent/tooling #flow/ready #priority/high #comp/tests #concept/state #scope/core #ai/instruct #task/domain/storage #task/object/migration-resilience #task/action/test-logic #task/state/begin

---

### Script

#### Acts 1: 扩展 `tests/migrations.test.js` 以包含容错性测试

我们将添加一个新的测试用例，模拟 LS 空间不足的情况。目前由于 `src/migrations.js` 中的 `catch` 块会重新抛出错误，这个测试**预期会失败**。

~~~~~act
patch_file
tests/migrations.test.js
~~~~~
~~~~~javascript.old
    expect(storedV6['Main Server'].Local[0].content).toBe('msg');
    expect(localStorage.getItem(STORAGE_KEY_V5)).toBeNull();
  });
});
~~~~~
~~~~~javascript.new
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
~~~~~

### 下一步建议

1.  **运行测试**: 执行 `npm test tests/migrations.test.js`。你将看到新添加的测试用例失败，报错信息为 `QuotaExceededError`。
2.  **修复实现**: 修改 `src/migrations.js` 中的 `migrateV6ToV7` 方法。
    - 将备份和清理 LS 的逻辑包裹在独立的 `try-catch` 中。
    - 如果备份失败，仅记录警告，不应 `throw`。
    - 确保迁移逻辑在 V4->V5, V5->V6 等路径上也有类似的容错性。
3.  **验证**: 再次运行测试，确保所有测试（包括新加的容错测试）均通过。

如果你准备好了，我可以为你生成修复 `src/migrations.js` 逻辑的计划。
