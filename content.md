## [WIP] perf: 实现分页指示器的乐观更新 (Optimistic UI Update)

### 用户需求
在快速点击“下一页”或“上一页”时，顶部的页码（如 `15 / 27`）应当立即发生变化，而不是等待数据从数据库加载完成后才更新。

### 评论
这是提升用户感知速度的关键优化。即使用户因为数据量大而面临短暂的数据加载（⏳ 加载中...），UI 层面的状态反馈（页码变化、按钮禁用状态切换）也应当是即时的。这种“乐观更新”能让用户感觉到系统对点击做出了即时响应，消除了操作后的“凝固感”。

### 目标
1.  在 `refreshView` 的最开始，立即同步 UI 中的页码和翻页按钮状态。
2.  确保该同步操作不阻塞后续的异步数据抓取。
3.  在异步加载完成后，依然进行最终渲染以确保数据一致性（例如处理总页数变动）。

### 基本原理
我们将 `ui/renderer.js` 中原本负责渲染分页逻辑的部分代码，“克隆”或“提前调用”到 `ui/index.js` 的 `refreshView` 入口处。由于 `refreshView` 能够通过 `uiState` 获取到用户点击后**最新**的页码，我们可以在进入异步等待之前，直接操作 DOM 更新文本。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #ai/delegate #task/domain/ui #task/object/pagination-indicator #task/action/optimization #task/state/continue

---

### Script

#### Acts 1: 在 `refreshView` 增加乐观更新逻辑

我们将修改 `src/ui/index.js` 中的 `refreshView` 函数。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const refreshView = async () => {
    const renderId = ++currentRenderId;
    const {
      viewingServer,
      currentPage,
      pageSize,
      viewMode,
      isLockedToBottom,
      selectedChannel: stateChannel,
    } = uiState.getState();
    const serverList = await dataAdapter.getServers();
~~~~~
~~~~~javascript.new
  const refreshView = async () => {
    const renderId = ++currentRenderId;
    const {
      viewingServer,
      currentPage,
      pageSize,
      totalPages,
      viewMode,
      isLockedToBottom,
      selectedChannel: stateChannel,
    } = uiState.getState();

    // 乐观更新分页指示器：在进行任何异步操作前，立即反馈页码变化
    if (viewMode === 'log') {
      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = isLast;
    }

    const serverList = await dataAdapter.getServers();
~~~~~

### 下一步建议
1.  **测试高频点击**：现在你可以尝试快速连点“下一页”。顶部的页码应当如丝般顺滑地连续跳动，而下方的文本框会显示“⏳ 加载中...”，直到你停止点击并等到最后一次请求的数据返回。
2.  **代码清理 (COMMIT)**：我们已经完成了元数据缓存、非阻塞 UI 以及乐观更新。当前的系统性能应该已经达到了非常理想的状态。如果你满意这些改动，可以要求我生成最终的 `[COMMIT]` 计划来清理工作现场。
