测试失败的原因在于 `events.js` 中的分页点击处理函数仅修改了状态并触发了异步的 `triggerRefresh()`。由于 `refreshView` 内部包含对数据库的 `await` 调用，DOM 的更新（包括 `active` 类的添加）被推迟到了下一个事件循环。

为了修复这个问题并提升用户体验，我将采用“乐观 UI (Optimistic UI)”策略：在点击按钮时立即同步修改 DOM 状态，而不仅仅是等待异步渲染循环。同时，我将修正测试用例，使用 `waitFor` 来更健壮地处理异步渲染周期。

## [WIP] fix: 增加分页控制的乐观 UI 更新以修复测试失败

### 错误分析

测试 `tests/ui.integration.test.js` 失败的原因是：
1.  用户点击 `>>` 按钮。
2.  点击监听器调用 `uiState.setLockedToBottom(true)` 和 `triggerRefresh()`。
3.  由于 `triggerRefresh` 是异步的（涉及 `await dataAdapter`），`renderer.render()` 尚未执行。
4.  测试脚本立即执行 `expect(lastBtn).toHaveClass('active')`，此时 DOM 尚未更新，导致断言失败。

### 用户需求
确保 UI 响应是瞬时的，并修复集成测试中的同步/异步竞态问题。

### 评论
在复杂的 Web 应用中，将状态变更与视觉反馈解耦是正确的，但关键的交互（如锁定/解锁）如果能提供同步反馈，会使应用显得更加灵敏（Snappy）。

### 目标
1.  在 `events.js` 中，为所有影响锁定状态的分页按钮添加同步的 DOM 操作。
2.  修正测试用例，使用 `waitFor` 以适应异步渲染流程。

### 基本原理
点击按钮时立即更新 `active` 类。这样即使后台正在加载数据，用户也能立即看到按钮状态的变化。同时，测试用例增加 `await waitFor` 是对异步系统进行测试的最佳实践。

### 标签
#intent/fix #flow/ready #priority/high #comp/ui #comp/tests #scope/ux #dx #task/domain/ui #task/object/pagination-feedback #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 为分页按钮增加乐观 UI 更新

我们将修改 `src/ui/events.js`，在分页按钮的点击处理函数中直接操作 DOM 样式。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  // --- Pagination ---
  dom.pageFirstBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(1);
    triggerRefresh();
  });
  dom.pagePrevBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(uiState.getState().currentPage - 1);
    triggerRefresh();
  });
  dom.pageNextBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(uiState.getState().currentPage + 1);
    triggerRefresh();
  });
  dom.pageLastBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().totalPages);
    uiState.setLockedToBottom(true);
    triggerRefresh();
  });
~~~~~
~~~~~javascript.new
  // --- Pagination ---
  dom.pageFirstBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(1);
    dom.pageLastBtn.classList.remove('active');
    dom.pageLastBtn.disabled = false;
    triggerRefresh();
  });
  dom.pagePrevBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(uiState.getState().currentPage - 1);
    dom.pageLastBtn.classList.remove('active');
    dom.pageLastBtn.disabled = false;
    triggerRefresh();
  });
  dom.pageNextBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(uiState.getState().currentPage + 1);
    dom.pageLastBtn.classList.remove('active');
    dom.pageLastBtn.disabled = false;
    triggerRefresh();
  });
  dom.pageLastBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().totalPages);
    uiState.setLockedToBottom(true);
    // 乐观更新：立即反馈锁定状态
    dom.pageLastBtn.classList.add('active');
    dom.pageLastBtn.disabled = true;
    triggerRefresh();
  });
~~~~~

#### Acts 2: 修正集成测试用例

修改 `tests/ui.integration.test.js`，使用 `waitFor` 来增强测试的健壮性。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
    await renderUI(mockAppState);
    const lastBtn = screen.getByText('»');
    const logDisplay = screen.getByRole('textbox');

    // 1. 点击末页进入锁定模式
    fireEvent.click(lastBtn);
    expect(lastBtn).toHaveClass('active');

    // 2. 模拟加载中状态（refreshView 异步流启动）
~~~~~
~~~~~javascript.new
  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
    await renderUI(mockAppState);
    const lastBtn = screen.getByText('»');
    const logDisplay = screen.getByRole('textbox');

    // 1. 点击末页进入锁定模式
    fireEvent.click(lastBtn);
    // 使用 waitFor 确保即使渲染循环有微小延迟也能通过
    await waitFor(() => expect(lastBtn).toHaveClass('active'));

    // 2. 模拟加载中状态（refreshView 异步流启动）
~~~~~

### 下一步建议

-   **重新执行测试**: 再次运行 `npm test tests/ui.integration.test.js` 确保测试通过。
-   **全链路验证**: 验证从“首页”点击到“末页”的往返交互，确保 `active` 类在所有路径下都能正确切换。
-   **性能观察**: 乐观更新是否消除了在慢速 IndexedDB 场景下的按钮点击“粘滞感”。
