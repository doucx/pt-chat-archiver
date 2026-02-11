[简要回答]
好的，分析发现测试失败是因为 `autoFollowServer` 默认为开启状态，导致 `setActiveServer` 自动更新了 `viewingServer`。我将修改测试用例，在验证“不再跟随”的逻辑前显式关闭自动跟随功能。

## [WIP] test: 修正 UI 状态测试以适配自动跟随逻辑

### 错误分析
测试 `tests/ui_state.test.js` 中的 `多服务器逻辑：查看服务器默认应跟随活动服务器` 失败。
- **原因**: `createUIState` 初始化时默认开启 `autoFollowServer: true`。因此，当测试代码调用 `setActiveServer('Server-C')` 时，逻辑会自动将 `viewingServer` 也更新为 `Server-C`，导致后续断言 `expect(viewingServer).toBe('Server-B')` 失败。
- **结论**: 测试用例未能正确模拟“停止跟随”的前置条件。需要在验证该行为前显式调用 `setAutoFollowServer(false)`。

### 用户需求
修正测试代码，使其匹配当前正确的 UI 行为逻辑。

### 评论
这是一个典型的测试逻辑漏洞，测试用例没有考虑到状态管理器的默认配置对测试场景的干扰。修正十分简单且必要。

### 目标
修改 `tests/ui_state.test.js`，在测试“查看服务器独立于活动服务器”的逻辑分支前，显式关闭自动跟随选项。

### 基本原理
通过在测试步骤中插入 `await uiState.setAutoFollowServer(false);`，确保测试环境符合预期（即用户不希望查看视图随活动服务器自动跳转），从而使断言通过。

### 标签
#intent/fix #flow/ready #priority/medium #comp/tests #scope/core #ai/instruct #task/domain/testing #task/object/ui-state #task/action/fix #task/state/begin

---

### Script

#### Acts 1: 修正测试用例

我们将在 `tests/ui_state.test.js` 中添加关闭自动跟随的步骤。

~~~~~act
patch_file
tests/ui_state.test.js
~~~~~
~~~~~javascript.old
    // 手动切换查看服务器后，不再随活动服务器改变
    uiState.setViewingServer('Server-B');
    uiState.setActiveServer('Server-C');
    expect(uiState.getState().viewingServer).toBe('Server-B');
    expect(uiState.getState().activeServer).toBe('Server-C');
~~~~~
~~~~~javascript.new
    // 关闭自动跟随，手动切换查看服务器后，不再随活动服务器改变
    await uiState.setAutoFollowServer(false);
    uiState.setViewingServer('Server-B');
    uiState.setActiveServer('Server-C');
    expect(uiState.getState().viewingServer).toBe('Server-B');
    expect(uiState.getState().activeServer).toBe('Server-C');
~~~~~

### 下一步建议
运行测试以确认修复。建议运行：`npm test tests/ui_state.test.js`。
