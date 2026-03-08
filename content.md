看来我们的测试用例没有跟上代码重构的节奏。由于 `autoSaveInterval` 及其 Setter 方法在源码中已被彻底移除，原本用于验证该功能的测试代码现在会因为找不到字段或函数而报错。

我将修正 `tests/ui_state.test.js`，移除这些过时的测试断言和方法调用。

## [WIP] fix(test): 同步移除测试用例中对“自动保存间隔”的引用

### 错误分析
在上一阶段的重构中，我们为了适配 IndexedDB 的实时写入特性，删除了 `autoSaveInterval` 逻辑。然而，`tests/ui_state.test.js` 中仍保留了相关的测试用例：
1.  **初始化测试**: 预期 `state.autoSaveInterval` 为默认值 `30`，但实际得到了 `undefined`。
2.  **持久化测试**: 尝试调用已不存在的 `uiState.setAutoSaveInterval(60)` 方法，导致 `TypeError`。

这属于典型的重构后测试未同步更新导致的回归失败。

### 用户需求
修正单元测试，使其符合当前“无自动保存间隔”的代码逻辑。

### 评论
单元测试必须与业务逻辑保持严格一致。在功能被有意删除后，相关的测试代码也应当被清理，以保持测试套件的有效性和准确性。

### 目标
1.  从 `tests/ui_state.test.js` 的“状态初始化”测试中移除对 `autoSaveInterval` 的断言。
2.  从“持久化同步”测试中移除对 `setAutoSaveInterval` 方法的调用及相关断言。

### 基本原理
直接移除测试文件中涉及已删除功能的代码行。由于该功能是彻底移除而非重命名，因此不需要替换为其他逻辑，直接删减即可使测试回归通过状态。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #concept/config #scope/dx #ai/instruct #task/domain/testing #task/object/ui-state-tests #task/action/bug-fix #task/state/continue

---

### Script

#### Acts 1: 修正 `tests/ui_state.test.js`

我们将清理测试用例中的过时断言和非法方法调用。

~~~~~act
patch_file
tests/ui_state.test.js
~~~~~
~~~~~javascript.old
  it('状态初始化：应正确合并存储中的配置与默认值', async () => {
    localStorage.setItem('chatLogArchive_config', JSON.stringify({ pageSize: 50 }));
    const uiState = await createUIState();
    const state = uiState.getState();

    expect(state.pageSize).toBe(50); // 来自存储
    expect(state.autoSaveInterval).toBe(30); // 默认值
    expect(state.viewMode).toBe('log'); // 默认初始视图
  });
~~~~~
~~~~~javascript.new
  it('状态初始化：应正确合并存储中的配置与默认值', async () => {
    localStorage.setItem('chatLogArchive_config', JSON.stringify({ pageSize: 50 }));
    const uiState = await createUIState();
    const state = uiState.getState();

    expect(state.pageSize).toBe(50); // 来自存储
    expect(state.viewMode).toBe('log'); // 默认初始视图
  });
~~~~~

~~~~~act
patch_file
tests/ui_state.test.js
~~~~~
~~~~~javascript.old
  it('持久化同步：修改配置应自动触发 localStorage 更新', async () => {
    const uiState = await createUIState();

    await uiState.setPageSize(200);
    await uiState.setAutoSaveInterval(60);

    const stored = JSON.parse(localStorage.getItem('chatLogArchive_config'));
    expect(stored.pageSize).toBe(200);
    expect(stored.autoSaveInterval).toBe(60);
  });
~~~~~
~~~~~javascript.new
  it('持久化同步：修改配置应自动触发 localStorage 更新', async () => {
    const uiState = await createUIState();

    await uiState.setPageSize(200);

    const stored = JSON.parse(localStorage.getItem('chatLogArchive_config'));
    expect(stored.pageSize).toBe(200);
  });
~~~~~

### 下一步建议
修复测试后，请重新运行 `npm test`。如果所有 18 个测试都变为绿色，则说明此次“移除冗余功能”的任务已圆满完成。之后我们可以进行一次 `[COMMIT]` 计划来整理代码。
