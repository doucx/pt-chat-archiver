这是一个非常符合直觉的改进。就像大多数现代聊天软件（如 Discord 或 Telegram）一样，当用户手动翻到最下面时，系统应该理解用户“想要看最新消息”的意图，并自动进入追踪状态。

## [WIP] feat: 增加手动滚动触底自动吸附功能

### 用户需求
当用户处于最后一页且手动向下滚动到 `textarea` 的绝对底部时，自动激活“吸附到底部”模式。

### 评论
这种“隐式激活”极大提升了用户体验。用户不需要专门去寻找并点击 `>>` 按钮，只需自然的滑动操作就能开启跟随。这使得整个 UI 的交互感更加丝滑且符合主流应用的操作逻辑。

### 目标
1.  修改 `events.js` 中的 `scroll` 监听逻辑。
2.  在用户触底时检测当前是否为最后一页。
3.  如果满足条件（最后一页 + 触底），则自动调用 `uiState.setLockedToBottom(true)` 并触发重绘。

### 基本原理
我们通过计算 `scrollTop`, `scrollHeight` 和 `clientHeight` 的关系来判断是否触底。在原有的 `scroll` 监听器中，我们不仅处理“向上滑动解锁”，也添加“触底加锁”的逻辑。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #concept/navigation #scope/ux #ai/instruct #task/domain/ui #task/object/auto-scroll-lock #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 升级滚动监听逻辑以支持双向状态切换

我们将更新 `src/ui/events.js` 中的滚动监听器，使其能够根据滚动位置自动切换吸附状态。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  // 手动向上滚动时解除“吸附到底部”模式
  dom.logDisplay.addEventListener('scroll', () => {
    const { isLockedToBottom } = uiState.getState();
    if (isLockedToBottom) {
      const threshold = 10; // 容差像素
      const isAtBottom =
        dom.logDisplay.scrollHeight - dom.logDisplay.scrollTop - dom.logDisplay.clientHeight <
        threshold;
      if (!isAtBottom) {
        uiState.setLockedToBottom(false);
        // 刷新渲染以更新按钮状态（>> 会从禁用变为启用）
        fullRender();
      }
    }
  });
~~~~~
~~~~~javascript.new
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
        fullRender();
      }
    } else {
      // 2. 未锁定状态下，如果在最后一页手动滑到底部，则自动加锁
      if (isAtBottom && currentPage === totalPages) {
        uiState.setLockedToBottom(true);
        fullRender();
      }
    }
  });
~~~~~

### 下一步建议

现在“吸附模式”的交互已经达到了工业级的水准：
- **主动激活**: 点击 `>>`。
- **隐式激活**: 在最后一页手动划到底。
- **隐式解除**: 向上滑动。
- **状态同步**: 自动翻页并维持锁定。

建议下一步：
- **移动端体验确认**: 在触屏设备上，手势滑动可能产生的 `scroll` 事件频率和值与鼠标略有不同，建议在实机上确认 10px 的 `threshold` 是否足够。
- **整理提交**: 这一系列 UI 改进已经非常完整，可以考虑将当前所有变更整理并进行一次 `[COMMIT]`，为本阶段的 UI 优化任务画上句号。
