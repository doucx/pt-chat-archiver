这是一个经典的竞态条件（Race Condition）与逻辑反馈环路问题。

点击 `>>`（最后一页）时，系统会将 `isLockedToBottom` 设为 `true` 并调用 `triggerRefresh`。由于 `refreshView` 是异步的，它在加载数据前会先将文本框内容设为 `“⏳ 数据加载与处理中...”`。这个临时的短文本会大幅减小 `scrollHeight`，导致浏览器强制调整 `scrollTop`，从而触发 `scroll` 事件。

在原有的 `scroll` 监听逻辑中，这个由于“加载中”状态引起的滚动会被误判为“用户向上滑动”（因为此时 `isAtBottom` 变为 `false`），从而错误地触发解锁逻辑。更糟糕的是，解锁又可能触发另一次刷新，形成死循环或状态锁死。

我将通过以下两点修复此问题：
1.  **加载状态保护**：在 `scroll` 监听器中增加 guard，如果当前文本框正处于“加载中”状态，忽略所有滚动事件。
2.  **解耦状态切换与刷新**：将吸附状态的视觉切换（按钮变色/禁用）与昂贵的全局 `triggerRefresh` 解耦。当用户通过滚动触发解锁/加锁时，直接更新 UI 状态，避免触发不必要的数据重新获取流。

## [WIP] fix: 修复点击 "最后一页" 后无法通过向上滚动脱离锁定的 bug

### 错误分析

该 bug 的根本原因在于 `scroll` 事件监听器与异步渲染流之间的反馈环路：

1.  **触发点**：用户点击 `>>` 按钮，`isLockedToBottom` 设为 `true`，启动 `triggerRefresh`。
2.  **副作用**：`refreshView` 立即执行 `dom.logDisplay.value = '⏳...'` 以显示加载状态。
3.  **连锁反应**：
    *   文本框内容变短 -> `scrollHeight` 减小 -> 浏览器强制改变 `scrollTop`。
    *   浏览器触发 `scroll` 事件。
4.  **误判**：`scroll` 监听器运行。由于此时内容是“加载中”的短文本，计算出的 `isAtBottom` 为 `false`。
5.  **错误解锁**：监听器看到 `isLockedToBottom` 为 `true` 但 `isAtBottom` 为 `false`，执行 `uiState.setLockedToBottom(false)` 并再次调用 `triggerRefresh`。
6.  **结果**：用户状态在“锁定”与“解锁”之间发生竞态冲突，导致 UI 表现为无法脱离底端或频繁闪烁加载。

### 用户需求
修复 UI 的吸附锁定逻辑，确保用户点击“最后一页”进入锁定模式后，依然能通过手动向上滚动正常解锁。

### 评论
这是一个关键的 UX 修复。在引入 IndexedDB 异步加载后，由于加载状态的存在，原本同步的 DOM 操作变得具有不确定性，必须在事件监听层面对这种中间状态进行屏蔽。

### 目标
1.  在 `scroll` 事件处理器中识别并忽略加载中状态。
2.  优化锁定状态切换逻辑，避免在滚动过程中触发全量数据刷新。

### 基本原理
通过检查 `dom.logDisplay.value` 是否以 `⏳` 开头来识别加载状态。同时，将 `isLockedToBottom` 的状态变更改为直接操作 DOM 元素的 `classList` 和 `disabled` 属性。由于用户已经在滚动，说明数据已经加载完成并显示在屏幕上，此时只需更新逻辑标志位和按钮样式，无需重新从数据库拉取数据并渲染。

### 标签
#intent/fix #flow/ready #priority/high #comp/ui #concept/navigation #scope/ux #ai/brainstorm #task/domain/ui #task/object/scroll-lock #task/action/bug-fix #task/state/begin

---

### Script

#### Acts 1: 优化滚动监听逻辑并增加加载状态保护

我们将修改 `src/ui/events.js` 中的 `scroll` 监听器，增加对加载状态的判断，并移除在滚动触发状态切换时对 `triggerRefresh()` 的依赖。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  // 处理滚动时的自动吸附与解锁逻辑
  dom.logDisplay.addEventListener('scroll', () => {
    const { isLockedToBottom, currentPage, totalPages } = uiState.getState();
    const threshold = 10; // 容差像素
    const isAtBottom =
      dom.logDisplay.scrollHeight - dom.logDisplay.scrollTop - dom.logDisplay.clientHeight <
      threshold;

    if (isLockedToBottom) {
      // 1. 已锁定状态下，向上滑动则解锁
      if (!isAtBottom) {
        uiState.setLockedToBottom(false);
        triggerRefresh();
      }
    } else {
      // 2. 未锁定状态下，如果在最后一页手动滑到底部，则自动加锁
      if (isAtBottom && currentPage === totalPages) {
        uiState.setLockedToBottom(true);
        triggerRefresh();
      }
    }
  });
~~~~~
~~~~~javascript.new
  // 处理滚动时的自动吸附与解锁逻辑
  dom.logDisplay.addEventListener('scroll', () => {
    // 关键修复：如果正在加载数据（显示加载提示），忽略由此引起的滚动变化
    if (dom.logDisplay.value.startsWith('⏳')) return;

    const { isLockedToBottom, currentPage, totalPages } = uiState.getState();
    const threshold = 10; // 容差像素
    const isAtBottom =
      dom.logDisplay.scrollHeight - dom.logDisplay.scrollTop - dom.logDisplay.clientHeight <
      threshold;

    if (isLockedToBottom) {
      // 1. 已锁定状态下，向上滑动则解锁
      if (!isAtBottom) {
        uiState.setLockedToBottom(false);
        // 实时更新按钮状态，无需触发完整的刷新流（防止加载状态循环）
        dom.pageLastBtn.classList.remove('active');
        dom.pageLastBtn.disabled = false;
      }
    } else {
      // 2. 未锁定状态下，如果在最后一页手动滑到底部，则自动加锁
      if (isAtBottom && currentPage === totalPages) {
        uiState.setLockedToBottom(true);
        dom.pageLastBtn.classList.add('active');
        dom.pageLastBtn.disabled = true;
      }
    }
  });
~~~~~

### 下一步建议

-   **验证**: 建议在不同网络延迟模拟下测试 `>>` 按钮的响应，确保在加载大型存档时，向上滚动能立即解锁。
-   **优化**: 考虑到移动端浏览器的橡皮筋回弹效果，可以观察 `threshold = 10` 是否足够稳定，如果仍有误触，可适当调大至 20-30。
-   **测试**: 应该在 `tests/ui.integration.test.js` 中增加一个模拟异步加载期间滚动的测试用例。
