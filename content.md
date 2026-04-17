这是一个非常合理的性能优化方案。通过引入预加载机制，我们可以将用户的翻页体验从“等待加载”转变为“即时响应”。

我已经在 `src/ui/index.js` 中实现了该机制，它会自动在主渲染流程结束后，利用空闲时间静默加载当前页前后的数据。

## [WIP] feat(ui): 为历史记录查看器引入相邻页面预加载机制

### 用户需求
用户希望在翻页时感觉更流畅。目前的机制是只有在用户点击翻页后才开始从 IndexedDB 加载数据。虽然有缓存，但首访翻页仍有延迟。需要添加预加载逻辑，在显示当前页后，自动在后台加载前一页和后一页到内存。

### 评论
预加载是提升 Web 应用感知性能的关键技术。结合现有的 `ViewCache` LRU 缓存系统，预加载可以将大多数翻页操作的时间复杂度从 O(Disk) 降低到 O(Memory)。

### 目标
1.  在 `src/ui/index.js` 中实现 `preloadAdjacentPages` 逻辑。
2.  在 `refreshView` 成功渲染当前页后，触发异步预加载。
3.  确保预加载过程是非阻塞的，且不会在后台执行时干扰当前视图的稳定性。

### 基本原理
当用户停留在第 N 页时，系统极大概率会下一步前往第 N-1 页或第 N+1 页。通过在渲染循环结束后启动一个不带 `await` 的异步任务，我们可以利用浏览器的空闲 I/O 提前将数据拉取到 `ViewCache` 中。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #concept/navigation #scope/ux #ai/instruct #task/domain/ui #task/object/preloader #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 实现预加载逻辑并集成到控制器

我们将修改 `src/ui/index.js`，在 `createUI` 函数内部添加预加载方法，并在 `refreshView` 的末尾调用它。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const viewCache = new ViewCache();

  // --- Async Controller Logic ---
~~~~~
~~~~~javascript.new
  const viewCache = new ViewCache();

  /**
   * 预加载当前页的相邻页面。
   * 采用静默加载模式，不触发 UI 状态更新。
   */
  const preloadAdjacentPages = async (page, total, server, channel, size) => {
    // 仅预加载 1 页半径内的未命中页面
    const targets = [page - 1, page + 1].filter(
      (p) => p >= 1 && p <= total && !viewCache.has(p),
    );

    for (const p of targets) {
      // 异步抓取，不使用 await 以免阻塞
      dataAdapter.getMessages(server, channel, p, size).then((result) => {
        // 校验上下文，确保在异步返回时用户没有切换频道
        if (viewCache.server === server && viewCache.channel === channel) {
          viewCache.set(p, result.messages);
        }
      });
    }
  };

  // --- Async Controller Logic ---
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
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
~~~~~javascript.new
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

    // [性能优化] 启动后台预加载
    if (viewMode === 'log' && currentServer && selectedChannel) {
      preloadAdjacentPages(currentPage, newTotalPages, currentServer, selectedChannel, pageSize);
    }
  };
~~~~~

### 下一步建议
- **性能观察**: 切换到日志模式并翻页，你会发现第二次进入某页时几乎是瞬发的，因为预加载已经在你浏览上一页时完成了。
- **内存考量**: 当前 `cachePages` 默认为 5，这足以容纳 [当前页, 前一页, 后一页] 以及之前的历史页。如果用户有极速翻页需求，可以在设置中将“内存缓存容量”调大。
- **提交准备**: 确认功能无误后，我将为你生成 `[COMMIT]` 计划以记录这两项重要的优化。
