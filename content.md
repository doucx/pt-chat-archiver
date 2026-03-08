你的分析非常准确。当前的自动跟随（锁定底部）逻辑仅在渲染时检查滚动条位置，但没有处理“总页数增加”的情况。当新消息导致产生新页面时，`currentPage` 仍然停留在旧的“最后一页”，导致用户看到的画面静止，无法跟随到新生成的页面。

我将修改 `src/ui/index.js` 中的核心控制器逻辑，使其在检测到处于“锁定底部”模式且产生新页面时，自动将 `currentPage` 推进到最新的末尾页，并重新获取数据。

## [WIP] fix: 修复聊天记录自动跟随在产生新页时的中断问题

### 错误分析

1.  **逻辑滞后**：在 `refreshView` 控制器中，`fetchPage` 是在函数开始时基于旧状态确定的。如果后续 fetch 结果显示 `totalCount` 增加并触发了新页面的产生（`newTotalPages > currentPage`），控制器并没有“追赶”这个变化的机制。
2.  **渲染条件不满足**：`renderer.js` 中的滚动探针 `if (isLockedToBottom && currentPage === totalPages)` 只有在 `currentPage` 确实等于 `totalPages` 时才会触发。由于控制器没有更新 `currentPage`，这个条件在翻页瞬间会变为 `false`。
3.  **状态未闭环**：虽然代码中有一段注释讨论了“吸附逻辑修正”，但并没有实际的代码实现来处理这种跨页的 re-fetch 逻辑。

### 用户需求

当用户点击 `>>` 开启自动跟随，或者手动滑到底部触发锁定后，无论消息如何增长（即使跨越了分页边界），UI 应当始终显示最新的消息。

### 评论

这是一个典型的“生产者-消费者”步调不一致问题。在分页系统中实现无限流式的“跟随”需要控制器具备感知元数据变化并自我修正的能力。

### 目标

1.  在 `src/ui/index.js` 的 `refreshView` 流程中加入页面追赶逻辑。
2.  当 `isLockedToBottom` 为真且检测到 `newTotalPages > currentPage` 时，强制更新 UI 状态并重新拉取最后一页数据。

### 基本原理

在控制器获取到最新 `totalCount` 后，计算出 `newTotalPages`。如果发现当前处于锁定模式且页面落后，立即调用 `uiState.setPage(newTotalPages)` 更新全局状态，并执行一次补充拉取，覆盖当前的 `messages` 变量，确保传递给渲染器的 context 包含的是最新的数据和正确的页码。

### 标签

#intent/fix #flow/ready #priority/high #comp/ui #concept/navigation #scope/ux #ai/refine #task/domain/ui #task/object/auto-follow #task/action/fix #task/state/begin

---

### Script

#### Acts 1: 修改控制器刷新逻辑

我们要替换 `src/ui/index.js` 中关于分页状态更新和自动吸附的占位部分，插入实际的逻辑修正代码。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    // 更新分页状态
    const newTotalPages = Math.ceil(totalCount / pageSize);
    uiState.setTotalPages(newTotalPages);

    // 自动吸附逻辑修正: 如果锁定了底部，强制跳到最后一页
    // (这需要在 fetch 之前做吗？不需要，fetch 后发现页码不对再 fetch?
    //  不，为了性能，应该在 fetch 前决定。但 totalCount 未知...)
    // 现在的逻辑是：先 fetch 这一页，Renderer 发现不对劲会改页码。
    // 我们保持原样，Renderer 可能会修正页码并触发重绘吗？
    // 原 Renderer 逻辑: if (locked) setPage(total);
    // 这会导致一次额外的渲染。为了 Phase 1 简单，先保留。

    const context = {
~~~~~
~~~~~javascript.new
    // 更新分页状态
    const newTotalPages = Math.ceil(totalCount / pageSize);
    uiState.setTotalPages(newTotalPages);

    // 自动吸附逻辑: 如果处于锁定底部模式，且当前页面不是最后一页（说明产生了新数据导致翻页），
    // 强制将状态更新为最后一页，并重新获取该页数据。
    if (isLockedToBottom && viewMode === 'log' && newTotalPages > currentPage) {
      uiState.setPage(newTotalPages);
      const followResult = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        newTotalPages,
        pageSize,
      );
      messages = followResult.messages;
    }

    const context = {
~~~~~

### 下一步建议

-   **验证测试**：建议进入一个消息频繁的频道，点击 `>>`，观察当消息达到分页阈值（默认 1000 条）时，页面是否能平滑跳转到下一页并保持滚动条触底。
-   **性能考虑**：目前的实现方式在翻页瞬间会触发两次 `getMessages` 调用（第一次发现翻页，第二次获取新页内容）。考虑到翻页并不是高频事件，这种实现是安全且健壮的。如果后续需要优化，可以考虑在 `dataAdapter` 中增加一个 `getLastPageMessages` 的专用接口。
