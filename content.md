你的分析非常到位。确实，测试失败最直接的原因是 **测试环境的状态污染**（State Leakage）。

在 Vitest/Jsdom 环境中，`@preact/signals` 的值是全局持久的。如果在 `beforeEach` 中没有重置 `currentPage` 或 `pageSize`，前一个测试修改的状态（比如翻到了第 2 页）会直接带入下一个测试。这解释了为什么你的测试在期待 "Message 1" 时却收到了 "Message 201"（因为 `pageSize` 可能被之前的测试改成了 200）。

此外，异步清理逻辑仍有死角：如果 `finalSelectedChannel` 为空（例如服务器刚切换还没选频道），`refreshView` 会直接跳过读取逻辑，此时如果不手动重置 `loadingMessage`，它也会残留。

## [WIP] fix(tests): 修复集成测试状态泄露及异步加载状态清理逻辑

### 错误分析

1.  **信号状态泄露**: 在 `tests/ui.integration.test.js` 中，`pageSize`、`currentPage` 等信号在测试用例之间没有被重置。
2.  **测试引用错误**: 在测试代码中尝试修改 `pageSize` 和 `statsLimit`，但忘记在文件顶部的 `import` 中包含它们，导致 `ReferenceError`。
3.  **状态清理死角**: 在 `src/ui/index.jsx` 的 `refreshView` 中，如果 `finalSelectedChannel` 为空，逻辑会直接跳到渲染部分，而没有机会清空 `loadingMessage`。

### 用户需求

修复回归测试中的失败，确保测试环境纯净。同时进一步增强 UI 异步状态的鲁棒性，确保在任何视图切换路径下加载动画都能正确消失。

### 评论

在处理包含全局状态（Signals）的复杂异步 UI 时，测试的“原子性”至关重要。我们必须在每次 `renderUI` 之前将所有相关的 UI 信号恢复到已知状态，否则竞态条件和状态残留将使集成测试变得不可信。

### 目标

1.  修改 `tests/ui.integration.test.js`：完善 `import` 列表，并在 `beforeEach` 中显式重置所有核心信号。
2.  修改 `src/ui/index.jsx`：在进入具体读取逻辑前或跳过读取逻辑时，确保 `loadingMessage` 有机会被重置。

### 基本原理

通过在测试框架的 `beforeEach` 钩子中执行“状态归位”，我们可以模拟用户第一次打开插件的干净环境。在主逻辑中，我们将 `loadingMessage` 的初始重置点提前，以覆盖所有可能提前退出的逻辑分支。

### 标签

#intent/fix #flow/ready #priority/high
#comp/ui #comp/tests #concept/state
#ai/refine
#task/domain/testing #task/object/signal-leakage #task/action/reset-state #task/state/continue

---

### Script

#### Acts 1: 完善集成测试的引用与状态重置

修复 `ReferenceError` 并确保每个测试都从第 1 页、默认分页大小开始。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
import {
  currentPage,
  isLockedToBottom,
  loadingMessage,
  viewMode,
} from '../src/ui/store/uiStore.js';
~~~~~
~~~~~javascript.new
import {
  currentPage,
  isLockedToBottom,
  loadingMessage,
  pageSize,
  selectedChannel,
  statsLimit,
  viewMode,
  viewingServer,
} from '../src/ui/store/uiStore.js';
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  beforeEach(async () => {
    await storageManager.init();
    viewMode.value = 'log';
    currentPage.value = 1;
    isLockedToBottom.value = false;
    mockAppState = {
~~~~~
~~~~~javascript.new
  beforeEach(async () => {
    await storageManager.init();
    // 显式重置所有可能被测试修改的全局信号，防止跨测试污染
    viewMode.value = 'log';
    currentPage.value = 1;
    pageSize.value = 1000;
    statsLimit.value = 5000;
    selectedChannel.value = 'Local';
    viewingServer.value = null;
    isLockedToBottom.value = false;
    loadingMessage.value = '';

    mockAppState = {
~~~~~

#### Acts 2: 消除 `refreshView` 中的加载状态清理盲区

确保在不满足读取条件时，也能清除旧任务可能留下的加载信息。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
    viewCache.setTotalCount(totalCount);

    if (currentServer && finalSelectedChannel && stateViewMode !== 'config') {
~~~~~
~~~~~javascript.new
    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
    viewCache.setTotalCount(totalCount);

    // 默认假设不需要显示加载信息，除非进入下方的异步逻辑
    if (stateViewMode !== 'config' && !viewCache.has(stateCurrentPage)) {
      // 保持现状，让下方的逻辑决定 loadingMessage
    } else {
      loadingMessage.value = '';
    }

    if (currentServer && finalSelectedChannel && stateViewMode !== 'config') {
~~~~~

### 下一步建议

1.  **再次运行测试**: 执行 `npm run test`。在重置了 `pageSize` 和 `currentPage` 之后，AssertionError 应该消失。
2.  **验证样式**: 既然统计页面的 `textarea` ID 已修复，可以手动打开页面确认文字是否已变为白色（这取决于 CSS 里的 `#log-archive-ui-log-display` 定义）。
3.  **准备提交**: 如果测试全绿，我们可以进行最后的 `[COMMIT]`。
