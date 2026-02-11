这是一个非常实用的交互优化。点击 `>>` 往往意味着用户想要查看最新产生的记录，而这些记录通常位于最后一页的最底端。

## [WIP] refactor: 优化 ">>" 按钮逻辑以支持自动滚动到底部

### 用户需求
修改分页控件中 `>>` (最后一页) 按钮的逻辑：点击后不仅跳转到最后一页，还要自动将日志显示区域 (`textarea`) 滚动到最底部。

### 评论
在当前的实现中，跳转到最后一页后，`textarea` 默认会显示在该页的最顶端。由于最新的聊天记录总是追加在末尾，用户跳转后往往还需要手动下拉。将其自动化符合直觉，提升了查看最新记录的效率。

### 目标
1.  修改 `events.js` 中的 `pageLastBtn` 点击事件处理函数。
2.  在执行 `fullRender()` 后，强制设置 `logDisplay` 的 `scrollTop` 为其 `scrollHeight`。

### 基本原理
由于 `renderer.render` 是同步执行的 DOM 操作，在 `fullRender()` 调用返回后，`textarea` 的内容已经更新。此时直接修改其 `scrollTop` 属性即可实现即时滚动。

### 标签
#intent/refine #flow/ready #priority/low #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/pagination #task/action/optimization #task/state/continue

---

### Script

#### Acts 1: 修改分页跳转逻辑

更新 `src/ui/events.js` 中关于“最后一页”按钮的事件监听器。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.pageNextBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().currentPage + 1);
    fullRender();
  });
  dom.pageLastBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().totalPages);
    fullRender();
  });

  // --- Config view actions ---
~~~~~
~~~~~javascript.new
  dom.pageNextBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().currentPage + 1);
    fullRender();
  });
  dom.pageLastBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().totalPages);
    fullRender();
    // 自动滚动到最底端以查看最新记录
    dom.logDisplay.scrollTop = dom.logDisplay.scrollHeight;
  });

  // --- Config view actions ---
~~~~~

### 下一步建议

跳转体验已优化。接下来可以考虑：
- **实时滚动感知**: 目前仅在手动点击 `>>` 时触发滚动。如果用户当前正停留在最后一页且未选中（Focus）任何文本，当有新消息进入时，是否也应自动滚动到底部以保持实时可见性？这可以通过在 `renderer.js` 中添加简单的位置判断逻辑来实现。
- **UI 交互反馈**: 考虑在设置页面增加一个“新消息自动滚动”的开关，给予用户更大的控制权。
