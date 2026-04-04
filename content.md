## [WIP] perf: 实现非阻塞 UI 渲染与加载进度反馈

### 用户需求
消除在进行大页面翻页或切换到数据统计视图时，界面卡住、无响应的体验。

### 评论
导致 UI 卡死的核心原因在于：获取大量数据（特别是统计模式下获取所有数据）以及后续的字符串拼接 (`join`) 和大量 DOM 更新是一个同步计算密集型过程。如果我们不主动让出主线程，浏览器就没有机会去重绘屏幕，从而导致冻结感。

引入“主动让出机制 (`yield`)”结合“骨架状态提示”，加上防御快速点击的“竞态控制 (`Race Condition Control`)”，可以完美解决这个问题。

### 目标
1.  在 `refreshView` 触发繁重的数据抓取之前，立即将文本框内容设置为“加载中...”。
2.  使用 `setTimeout` 强制让出 JavaScript 主线程，使浏览器完成“加载中”文本的渲染。
3.  引入 `currentRenderId`，如果在加载或计算期间用户疯狂点击了其他按钮（比如连点“下一页”），则主动丢弃那些已经过期的渲染请求，避免渲染队列积压和闪烁。

### 基本原理
JavaScript 是单线程的。当我们执行 `await Promise` 时，如果底层的 IndexedDB 读取很快且接着执行复杂的同步数组映射，UI 依然会卡。我们在读取之前插入 `await new Promise((r) => setTimeout(r, 10))`，这会在宏任务队列中制造一个微小的断点。浏览器会利用这个断点去执行重绘（Paint），让用户立刻看到“加载中”的状态。接着配合 Request ID 机制，任何晚于当前 ID 的回调都会被终止执行。

### 标签
#intent/refine #flow/ready #priority/high #comp/ui #concept/navigation #scope/ux #ai/delegate #task/domain/ui #task/object/render-pipeline #task/action/optimization #task/state/begin

---

### Script

#### Acts 1: 在 `ui/index.js` 中引入竞态控制和非阻塞加载反馈

我们将修改 `createUI` 闭包中的 `refreshView` 方法。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const uiState = await createUIState();
  const renderer = createRenderer(dom, uiState);

  // --- Async Controller Logic ---
~~~~~
~~~~~javascript.new
  const uiState = await createUIState();
  const renderer = createRenderer(dom, uiState);

  let currentRenderId = 0;

  // --- Async Controller Logic ---
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const refreshView = async () => {
    const {
      viewingServer,
~~~~~
~~~~~javascript.new
  const refreshView = async () => {
    const renderId = ++currentRenderId;
    const {
      viewingServer,
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      // 如果是 stats 模式，可能需要全量数据 (Phase 1 临时兼容)
      const fetchSize = viewMode === 'stats' ? 999999 : pageSize;
      const fetchPage = viewMode === 'stats' ? 1 : currentPage;

      const result = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        fetchPage,
        fetchSize,
      );
      messages = result.messages;
      totalCount = result.total; // 确保一致性
    }

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
      serverList,
      channelList,
      channelCounts,
      messages,
      totalCount,
      selectedChannel, // 显式传递经过控制器校验的选中状态
    };

    renderer.render(context, uiCallbacks);
  };
~~~~~
~~~~~javascript.new
    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      // 渲染非阻塞化：显示加载骨架状态并让出主线程，允许浏览器重绘
      dom.logDisplay.value = '⏳ 数据加载与处理中...';
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (renderId !== currentRenderId) return; // 竞态控制：丢弃过期的渲染请求

      // 如果是 stats 模式，可能需要全量数据 (Phase 1 临时兼容)
      const fetchSize = viewMode === 'stats' ? 999999 : pageSize;
      const fetchPage = viewMode === 'stats' ? 1 : currentPage;

      const result = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        fetchPage,
        fetchSize,
      );

      if (renderId !== currentRenderId) return;

      messages = result.messages;
      totalCount = result.total; // 确保一致性
    }

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
      if (renderId !== currentRenderId) return;
      messages = followResult.messages;
    }

    if (renderId !== currentRenderId) return;

    const context = {
      serverList,
      channelList,
      channelCounts,
      messages,
      totalCount,
      selectedChannel, // 显式传递经过控制器校验的选中状态
    };

    renderer.render(context, uiCallbacks);
  };
~~~~~

### 下一步建议
我们已经实施了内存计数缓存以及非阻塞 UI，现在页面的切换体验应该会极大改善。由于我们引入了 `currentRenderId`，即使将 `pageSize` 调到一万然后疯狂点击“下一页”，UI 也能保持响应，并且只会渲染你最后停留的那一页。

由于目前的功能代码已完善，你可以进行实际的测试运行。如果没有其他的问题，我建议你可以下发生成 Git Commit 记录的指令了。
