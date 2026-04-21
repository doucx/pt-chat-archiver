虽然我们已经在 `beforeEach` 中重置了信号，但由于 **`localStorage` 的持久性**，`storageManager.init()` 会在信号重置之前或过程中把旧测试保存的 `pageSize: 50` 和 `currentPage: 5`（来自“跳转到末尾”测试）加载回来。

这次我们彻底清理测试环境，并在 `StatsView` 的状态切换中增加更严谨的保护。

## [WIP] fix(tests): 彻底隔离集成测试环境并修复统计视图样式

### 错误分析

1.  **LocalStorage 污染**: 在 `jsdom` 环境中，`localStorage` 在同一个文件的不同测试之间是共享的。前一个测试通过 `updateConfig` 将 `pageSize` 改为 50 并保存到了磁盘。下一个测试启动时，`initStore` 重新读取了这个 50，导致分页计算产生偏移。
2.  **信号竞争**: 虽然我们在 `beforeEach` 底部手动重置了信号，但 `createUI` 内部的 `effect` 可能已经在信号重置完成前，利用从 `localStorage` 读取到的旧数据触发了第一次渲染。
3.  **统计视图样式**: `StatsView.jsx` 需要确保在加载状态下也挂载正确的 `id`，以保证字体颜色。

### 用户需求

确保集成测试不再受到上一个测试运行结果的影响（“Message 201”错误），同时确保统计页面的文字颜色正确。

### 评论

在编写涉及持久化存储的集成测试时，仅仅重置内存状态（Signals）是不够的，必须同时重置底层存储（LocalStorage/IndexedDB）。这是保证测试可重复性的金科玉律。

### 目标

1.  修改 `tests/ui.integration.test.js`：在 `beforeEach` 中首先执行 `localStorage.clear()`。
2.  修改 `src/ui/components/StatsView.jsx`：确保样式绑定无误。
3.  优化 `src/ui/index.jsx`：确保在从异步任务切回同步任务（缓存命中的日志视图）时，加载状态被物理清除。

### 标签

#intent/fix #flow/ready #priority/high
#comp/tests #comp/ui #concept/state
#ai/refine
#task/domain/testing #task/object/test-isolation #task/action/clear-storage #task/state/continue

---

### Script

#### Acts 1: 物理清理测试环境

在每个测试开始前，物理抹除 `localStorage`，确保 `initStore` 总是加载默认值。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  beforeEach(async () => {
    await storageManager.init();
    // 显式重置所有可能被测试修改的全局信号，防止跨测试污染
~~~~~
~~~~~javascript.new
  beforeEach(async () => {
    // 物理清理存储，防止跨测试的数据污染 (如 pageSize: 50 导致的 Message 201 错误)
    localStorage.clear();

    await storageManager.init();
    // 显式重置所有可能被测试修改的全局信号，防止跨测试污染
~~~~~

#### Acts 2: 完善 `StatsView` 样式绑定

确保 `StatsView` 在任何状态下都持有正确的 `id`。

~~~~~act
patch_file
src/ui/components/StatsView.jsx
~~~~~
~~~~~javascript.old
  return (
    <div
      id="log-archive-stats-view"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px' }}
    >
      <textarea
        id="log-archive-ui-log-display"
        readOnly
        className="log-archive-ui-log-display"
        style={{ flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.2)' }}
        value={loading || statsText}
      />
    </div>
  );
~~~~~
~~~~~javascript.new
  return (
    <div
      id="log-archive-stats-view"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px' }}
    >
      <textarea
        id="log-archive-ui-log-display"
        readOnly
        className="log-archive-ui-log-display"
        style={{ flexGrow: 1, color: '#fff', backgroundColor: 'rgba(0,0,0,0.2)' }}
        value={loading || statsText}
      />
    </div>
  );
~~~~~

#### Acts 3: 优化 `refreshView` 状态清理逻辑

在进入主逻辑前，对 `loadingMessage` 进行初始化，确保非异步路径不留残留。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
    viewCache.setTotalCount(totalCount);

    // 默认假设不需要显示加载信息，除非进入下方的异步逻辑
    if (stateViewMode !== 'config' && !viewCache.has(stateCurrentPage)) {
      // 保持现状，让下方的逻辑决定 loadingMessage
    } else {
      loadingMessage.value = '';
    }
~~~~~
~~~~~javascript.new
    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
    viewCache.setTotalCount(totalCount);

    // 状态清理：如果当前是配置模式，或者日志页面命中了缓存，
    // 我们必须立即清除可能存在的旧加载状态。
    if (stateViewMode === 'config' || (stateViewMode === 'log' && viewCache.has(stateCurrentPage))) {
      loadingMessage.value = '';
    }
~~~~~

### 下一步建议

由于添加了 `localStorage.clear()`，现在 `initStore` 应该能稳定加载 `pageSize: 1000`。请再次运行 `npm run test`。如果测试通过，意味着我们成功解决了 **状态泄露** 和 **样式丢失** 两个核心问题。
