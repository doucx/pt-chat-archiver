测试失败的原因非常明确：在 `createUI` 时，UI 容器的默认样式是 `display: none`。而 `testing-library` 的 `getByRole` 默认会忽略不可见的元素，导致无法找到 `textarea`（textbox）。

我将修正测试脚本，在操作前模拟点击切换按钮以显示 UI，并确保测试逻辑与组件逻辑完全对齐。

## [WIP] fix: 修正回归测试脚本中的 UI 可见性问题

### 错误分析
- **测试环境不一致**: 测试脚本直接修改了 `viewMode` 信号，但没有触发 UI 的显示逻辑。由于 `log-archive-ui-container` 处于隐藏状态，其内部的所有表单元素在可访问性树（Accessibility Tree）中都是不可见的，因此 `screen.getByRole('textbox')` 抛出了错误。

### 用户需求
- 修复测试脚本，使其能够正确找到并验证 UI 元素。

### 目标
1.  在 `tests/ui.stats_loading.test.js` 中增加显示 UI 的操作。
2.  确保 `loadingMessage` 在测试中的同步性。

### 基本原理
- 在 `createUI` 之后模拟点击 `log-archive-ui-toggle-button`。这将改变容器的 `display` 样式，使得内部的 `textarea` 对测试框架可见。

### 标签
#intent/tooling #flow/ready #priority/medium #comp/tests #concept/ui #ai/refine #task/domain/testing #task/object/loading-state-regression #task/action/fix-test-script #task/state/continue

---

### Script

#### Acts 1: 修正 `tests/ui.stats_loading.test.js`

我们将添加点击切换按钮的逻辑，确保 UI 处于可见状态。

~~~~~act
patch_file
tests/ui.stats_loading.test.js
~~~~~
~~~~~javascript.old
    activeUI = await createUI(adapter, mockCallbacks);
    await activeUI.updateRecordingStatus('S1', 'Local');

    // 1. 进入统计视图
    viewMode.value = 'stats';
~~~~~
~~~~~javascript.new
    activeUI = await createUI(adapter, mockCallbacks);
    await activeUI.updateRecordingStatus('S1', 'Local');

    // 显示 UI
    const toggleBtn = document.getElementById('log-archive-ui-toggle-button');
    if (toggleBtn) fireEvent.click(toggleBtn);

    // 1. 进入统计视图
    viewMode.value = 'stats';
~~~~~

~~~~~act
patch_file
tests/ui.stats_loading.test.js
~~~~~
~~~~~javascript.old
    activeUI = await createUI(adapter, mockCallbacks);
    await activeUI.updateRecordingStatus('S1', 'Local');

    // 1. 触发统计加载
    viewMode.value = 'stats';
~~~~~
~~~~~javascript.new
    activeUI = await createUI(adapter, mockCallbacks);
    await activeUI.updateRecordingStatus('S1', 'Local');

    // 显示 UI
    const toggleBtn = document.getElementById('log-archive-ui-toggle-button');
    if (toggleBtn) fireEvent.click(toggleBtn);

    // 1. 触发统计加载
    viewMode.value = 'stats';
~~~~~

### 下一步建议
- **执行测试**: 再次运行 `npm test tests/ui.stats_loading.test.js`。此时 UI 应该已可见，`getByRole` 能够正常工作。
- **验证效果**: 观察测试报告中关于“进度文字显示”和“切换视图清理”的断言是否通过。如果通过，说明我们的修复完全解决了残留问题。
