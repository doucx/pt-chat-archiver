非常抱歉。在上一阶段的计划中，我修改了生产代码的 API（将 `setActiveServer` 升级为 `setRecordingStatus`，将 `updateServerDisplay` 升级为 `updateRecordingStatus`），但未能同步更新测试文件，导致了测试套件的回归失败。

我现在将生成一个修复计划，使测试用例与新的接口定义保持一致。

## [WIP] fix: 同步测试用例以适配 UI 接口变更

### 错误分析

- **根本原因**: 在上一个计划中执行了破坏性的 API 重命名（Refactor），但未能在同一批次中更新测试代码。
- **症状**: `tests/ui_state.test.js` 报错 `uiState.setActiveServer is not a function`；`tests/ui.integration.test.js` 等报错 `ui.updateServerDisplay is not a function`。
- **解决方案**: 批量将测试文件中的旧方法调用替换为对应的新方法调用。

### 用户需求

修复测试套件，确保系统在功能升级后的稳定性验证依然有效。

### 评论

这是维护 ACA 架构一致性的必要步骤。API 变更必须伴随着测试的同步更新，以维持“单一事实来源”的可靠性。

### 目标

1.  修复 `tests/ui_state.test.js` 中的 `uiState` 方法调用。
2.  修复 `tests/ui.integration.test.js` 中的 `ui` 控制句柄调用。
3.  修复 `tests/ui.clean_duplicates.test.js` 中的 `ui` 控制句柄调用。

### 基本原理

根据 `d3l-quipu-core-rules`，当重构幅度涉及公共接口时，必须确保所有引用点（包括测试）被正确修补。我们将通过 `patch_file` 精确替换这些调用点。

### 标签

#intent/fix #flow/ready #priority/high #comp/tests #scope/dx #ai/refine #task/domain/testing #task/object/test-suite #task/action/sync #task/state/continue

---

### Script

#### Acts 1: 修复 UI 状态逻辑测试

将 `setActiveServer` 替换为 `setRecordingStatus`。

~~~~~act
patch_file
tests/ui_state.test.js
~~~~~
~~~~~javascript.old
  it('多服务器逻辑：查看服务器默认应跟随活动服务器', async () => {
    const uiState = await createUIState();

    // 初始设置活动服务器
    uiState.setActiveServer('Server-A');
    expect(uiState.getState().viewingServer).toBe('Server-A');

    // 关闭自动跟随，手动切换查看服务器后，不再随活动服务器改变
    await uiState.setAutoFollowServer(false);
    uiState.setViewingServer('Server-B');
    uiState.setActiveServer('Server-C');
    expect(uiState.getState().viewingServer).toBe('Server-B');
    expect(uiState.getState().activeServer).toBe('Server-C');
  });
~~~~~
~~~~~javascript.new
  it('多服务器逻辑：查看服务器默认应跟随活动服务器', async () => {
    const uiState = await createUIState();

    // 初始设置活动服务器
    uiState.setRecordingStatus('Server-A', 'Local');
    expect(uiState.getState().viewingServer).toBe('Server-A');

    // 关闭自动跟随，手动切换查看服务器后，不再随活动服务器改变
    await uiState.setAutoFollowServer(false);
    uiState.setViewingServer('Server-B');
    uiState.setRecordingStatus('Server-C', 'Local');
    expect(uiState.getState().viewingServer).toBe('Server-B');
    expect(uiState.getState().activeServer).toBe('Server-C');
  });
~~~~~

#### Acts 2: 修复 UI 集成测试

将 `ui.updateServerDisplay` 替换为 `ui.updateRecordingStatus`。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
async function renderUI(initialState) {
  document.body.innerHTML = '';
  const adapter = createMockAdapter(initialState);
  const ui = await createUI(adapter, mockCallbacks);
  ui.updateServerDisplay('Test Server');
  return ui;
}
~~~~~
~~~~~javascript.new
async function renderUI(initialState) {
  document.body.innerHTML = '';
  const adapter = createMockAdapter(initialState);
  const ui = await createUI(adapter, mockCallbacks);
  ui.updateRecordingStatus('Test Server', 'Local');
  return ui;
}
~~~~~

#### Acts 3: 修复重复项清理 UI 测试

同步更新 `ui.updateRecordingStatus` 调用。

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
  it('点击扫描后应能正确识别重复项并改变按钮状态为清理', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');

    // 进入设置页面
~~~~~
~~~~~javascript.new
  it('点击扫描后应能正确识别重复项并改变按钮状态为清理', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateRecordingStatus('Server A', 'Local');

    // 进入设置页面
~~~~~
~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
  it('点击清理按钮应当执行删除逻辑并重置 UI', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');

    fireEvent.click(screen.getByTitle('设置'));
~~~~~
~~~~~javascript.new
  it('点击清理按钮应当执行删除逻辑并重置 UI', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateRecordingStatus('Server A', 'Local');

    fireEvent.click(screen.getByTitle('设置'));
~~~~~

### 下一步建议

- **全量测试**: 执行 `npm test` 确认所有 12 个测试文件、40 个测试用例全部通过。
- **COMMIT**: 在确认测试通过后，我们将通过一个新的计划将这一系列变更（功能修复 + UI 增强 + 测试同步）作为一个完整单元进行提交。
