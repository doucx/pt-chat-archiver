我们将增强“吸附到底部”模式的行为，使其具备**自动翻页**能力。当新消息涌入并触发分页时，如果吸附模式已开启，UI 将自动跳转到最新的页面，确保用户始终看到最实时的对话。

## [WIP] feat: 实现“吸附模式”下的自动翻页逻辑

### 用户需求
在“吸附到底部” (Locked to Bottom) 模式下，当消息总数增加导致产生新的分页时，UI 应当自动跳转到最后一页（即最新的一页），而不是停留在旧的“最后一页”。

### 评论
这是吸附模式的完整闭环。如果吸附模式只能在当前页滚动而不能跨页跳转，那么一旦消息跨越分页阈值，用户就会“丢失”目标，这违背了该功能的设计初衷。通过自动翻页，我们实现了真正意义上的“消息追踪”。

### 目标
1.  修改 `renderer.js` 中的逻辑，在计算出新的 `totalPages` 后，若处于吸附模式，则强制将 `currentPage` 设置为 `totalPages`。
2.  确保消息切片（Slicing）逻辑使用更新后的页码。

### 基本原理
在 `renderer.js` 的渲染循环中，我们已经计算了最新的总页数。通过在该环节介入并更新 `uiState` 中的当前页码，我们可以确保接下来的 DOM 渲染和文本填充使用的是最新页的数据。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #concept/navigation #scope/ux #ai/instruct #task/domain/ui #task/object/auto-paging #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 修改渲染器逻辑以支持自动翻页

我们将更新 `src/ui/renderer.js` 中处理日志视图的分页计算部分。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    } else {
      // 'log' view
      dom.paginationControls.style.display = 'flex';
      uiState.setTotalPages(Math.ceil(messages.length / pageSize));
      const { totalPages } = uiState.getState(); // Re-fetch after update
      if (currentPage > totalPages) uiState.setPage(totalPages);

      const startIndex = (currentPage - 1) * pageSize;
      const paginatedMessages = messages.slice(startIndex, startIndex + pageSize);

      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value =
          paginatedMessages.length > 0
            ? paginatedMessages.map(formatMessageForDisplay).join('\n')
            : `--- 在频道 [${selectedChannel}] 中没有记录 ---`;
      });

      // 如果处于吸附模式，确保滚动到底部
      if (isLockedToBottom && currentPage === totalPages) {
        dom.logDisplay.scrollTop = dom.logDisplay.scrollHeight;
      }

      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
~~~~~
~~~~~javascript.new
    } else {
      // 'log' view
      dom.paginationControls.style.display = 'flex';
      uiState.setTotalPages(Math.ceil(messages.length / pageSize));
      let { totalPages } = uiState.getState();

      // 自动翻页逻辑：如果吸附到底部，强制同步到最后一页
      if (isLockedToBottom) {
        uiState.setPage(totalPages);
      } else if (currentPage > totalPages) {
        uiState.setPage(totalPages);
      }

      // 重新获取最新的状态值进行渲染
      const activeState = uiState.getState();
      const activePage = activeState.currentPage;

      const startIndex = (activePage - 1) * pageSize;
      const paginatedMessages = messages.slice(startIndex, startIndex + pageSize);

      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value =
          paginatedMessages.length > 0
            ? paginatedMessages.map(formatMessageForDisplay).join('\n')
            : `--- 在频道 [${selectedChannel}] 中没有记录 ---`;
      });

      // 如果处于吸附模式，确保滚动到底部
      if (isLockedToBottom && activePage === totalPages) {
        dom.logDisplay.scrollTop = dom.logDisplay.scrollHeight;
      }

      dom.pageInfoSpan.textContent = `${activePage} / ${totalPages}`;
~~~~~

### 下一步建议

现在“吸附到底部”模式已经非常完善了：
1.  用户点击 `>>` 激活锁定。
2.  新消息进入时，如果是当前页，自动滚动。
3.  如果新消息触发了新页，自动翻页并滚动。
4.  用户手动上滚，锁定自动解除。

建议下一步：
- **UI 提示强化**: 正如之前提到的，可以考虑为 `>>` 按钮添加一个 `active` 类名。当处于吸附模式时，按钮背景色稍微变亮或变绿，让用户能直观看到“锁定”状态。
- **性能确认**: 随着功能的增加，`render` 函数变得越来越重，建议在超大数据量（如 10 万条以上消息且开启 10000 分页大小时）下进行压力测试。
