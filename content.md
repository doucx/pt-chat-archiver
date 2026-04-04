## [WIP] perf: 引入预检防抖逻辑以彻底消除连续点击产生的 I/O 堆积

### 用户需求
在快速连续点击翻页时，消除因无效请求积压导致的最终加载延迟，使连续操作的响应时间与单次操作保持一致。

### 评论
目前的机制是“先发射请求，后丢弃结果”。在 I/O 密集型应用中，这依然会产生队列阻塞。我们需要切换到“确定用户停下来后，才发射请求”的策略，即对**重型 I/O 操作**进行防抖处理。由于我们将页码更新放在了防抖之前，用户依然能获得即时的视觉反馈（乐观更新），而数据库只会在用户停止点击的那一刻收到一次请求。

### 目标
1.  在 `refreshView` 内部，在执行任何 `await` 操作之前引入一个 `100ms` 的冷静期。
2.  将所有数据库相关的 `await` 调用移至冷静期之后。
3.  确保单次点击的体感延迟不明显，同时连续点击时只有最后一次生效。

### 基本原理
利用 `renderId` 配合 `setTimeout` 延迟。当用户在 100ms 内点击了 10 次，前 9 次 `refreshView` 执行到 `await sleep(100)` 时会被暂停。当 100ms 过去，前 9 次唤醒后会立即发现 `renderId` 已经不再是自己，从而直接退出，**完全不会触发任何数据库查询**。只有第 10 次请求会跨过检查点，向数据库发起唯一的查询请求。

### 标签
#intent/refine #flow/ready #priority/high #comp/ui #concept/executor #scope/ux #ai/delegate #task/domain/ui #task/object/io-debounce #task/action/optimization #task/state/continue

---

### Script

#### Acts 1: 修改 `refreshView` 引入冷静期和请求穿透防护

我们将重构 `src/ui/index.js` 中的执行顺序。

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

    // 确保 viewingServer 有效
    if (!viewingServer && serverList.length > 0) {
      uiState.setViewingServer(serverList[0]);
    }
    const currentServer = uiState.getState().viewingServer;
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

    // 1. 乐观更新分页指示器：立即反馈页码变化（无需等待 I/O）
    if (viewMode === 'log') {
      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = isLast;
    }

    // 2. 引入冷静期 (防抖)：让出主线程 100ms，等待用户可能的连续点击
    // 这能有效防止快速操作时大量无效 I/O 请求塞满 IndexedDB 队列
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (renderId !== currentRenderId) return;

    // 3. 开始执行异步数据获取（此时已确定这是最新的一次请求）
    const serverList = await dataAdapter.getServers();
    if (renderId !== currentRenderId) return;

    // 确保 viewingServer 有效
    if (!viewingServer && serverList.length > 0) {
      uiState.setViewingServer(serverList[0]);
    }
    const currentServer = uiState.getState().viewingServer;
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      // 渲染非阻塞化：显示加载骨架状态并让出主线程，允许浏览器重绘
      dom.logDisplay.value = '⏳ 数据加载与处理中...';
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (renderId !== currentRenderId) return; // 竞态控制：丢弃过期的渲染请求
~~~~~
~~~~~javascript.new
    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      // 显示加载提示（仅针对需要长时间处理的大查询）
      if (pageSize >= 1000 || viewMode === 'stats') {
        dom.logDisplay.value = '⏳ 数据加载与处理中...';
        // 此处不再需要额外的 setTimeout(10)，因为上方的 100ms 已完成重绘
      }

      if (renderId !== currentRenderId) return;
~~~~~

### 下一步建议
1.  **体感测试**：现在进行连续点击。你会发现页码跳动依然极其灵敏（因为它是同步执行的），但数据库查询只会当你“停手”后的 100ms 才发出。这样无论你点 5 次还是 10 次，最后一次数据的加载速度都会保持一致。
2.  **完成任务**：性能优化阶段告一段落。如果你测试后感觉流畅度达到了预期，我们可以准备结项并进行正式的 Git Commit 了。
