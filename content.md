这一结果非常具有启发性：`expected '--- 在频道 [Local] 中没有记录 ---' to contain 'Message 1'`。

这说明：
1.  `loadingMessage` 确实被成功清除了（否则我们会看到“正在读取...”）。
2.  但此时 `currentMessages` 却是空的。
3.  **根源在于 `viewCache.has` 的逻辑错误**：在 `view-cache.js` 中，我之前引入的 `isLastPage` 判断逻辑有误（`page === ... || 1` 永远返回真），导致缓存系统误认为一个空的或过期的缓存项是有效的。
4.  **异步竞态**：我在 `refreshView` 顶部过早地清除了 `loadingMessage`。由于 `refreshView` 内部有多个 `await` 点（如 `getServers`, `getChannels`），在这些 `await` 期间，UI 会因为 `viewMode` 改变而重新渲染，此时加载信息已失踪，但新数据尚未填入 `currentMessages`，导致用户（或测试脚本）看到了瞬时的“无记录”空状态。

我将生成最终的修复计划。

## [WIP] fix(ui): 修复缓存逻辑漏洞、异步状态同步及集成测试隔离性

### 错误分析

1.  **缓存有效性误判**: `view-cache.js` 中的 `has()` 方法逻辑错误，导致它在某些情况下（如分页大小变化后）对陈旧或空的缓存页返回 `true`。
2.  **过早清理加载状态**: `src/ui/index.jsx` 在异步数据流尚未到达 `batch` 更新点时就清除了 `loadingMessage`，造成了 UI 闪烁出“无记录”提示的中间态。
3.  **测试环境污染**: 虽然在 `beforeEach` 中重置了信号，但由于 `storageManager.init()` 会在信号重置后再次从 `localStorage` 加载旧数据，导致 `pageSize` 等关键配置在测试间产生了漂移。

### 用户需求

彻底修复统计页面点击导致进度残留、颜色不对以及切回日志时偶现“无记录”的 Bug。确保集成测试环境完全隔离。

### 目标

1.  **修复 `ViewCache`**: 正确实现 `has()` 逻辑，严谨判断最后一页的完整性。
2.  **原子化状态更新**: 将 `loadingMessage` 的重置移回 `batch` 块或紧邻数据赋值处，消除 UI 中间态。
3.  **强化测试隔离**: 在 `tests/ui.integration.test.js` 的 `beforeEach` 中，确保在所有逻辑启动前物理清空 `localStorage`。

### 基本原理

通过确保 UI 状态的“推”过程是原子的（即：要么显示旧页面的加载中，要么显示新页面的数据，而不允许出现“非加载且无数据”的真空期），我们可以消除所有竞态引起的显示异常。同时，通过修复缓存断言，确保系统在分页配置变化时能正确触发重新拉取。

### 标签

#intent/fix #flow/ready #priority/high
#comp/ui #comp/tests #concept/state #concept/cache
#ai/refine
#task/domain/ui #task/object/view-cache #task/action/synchronization-fix #task/state/end

---

### Script

#### Acts 1: 修复 `ViewCache` 逻辑漏洞

确保缓存系统能准确识别最后一页，并防止非法的缓存命中。

~~~~~act
patch_file
src/ui/view-cache.js
~~~~~
~~~~~javascript.old
  has(page) {
    if (!this.pages.has(page)) return false;
    const msgs = this.pages.get(page);
    const isLastPage = page === Math.ceil(this.totalCount / this.pageSize) || 1;
    return msgs.length === this.pageSize || isLastPage;
  }
~~~~~
~~~~~javascript.new
  has(page) {
    if (!this.pages.has(page)) return false;
    const msgs = this.pages.get(page);
    const totalPages = Math.ceil(this.totalCount / this.pageSize) || 1;
    const isLastPage = page === totalPages;
    return msgs.length === this.pageSize || isLastPage;
  }
~~~~~

#### Acts 2: 修正 `refreshView` 中的状态同步时序

移除危险的抢跑式清理逻辑，将 `loadingMessage` 的重置与数据更新绑定。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
    viewCache.setTotalCount(totalCount);

    // 状态清理：如果当前是配置模式，或者日志页面命中了缓存，
    // 我们必须立即清除可能存在的旧加载状态。
    if (stateViewMode === 'config' || (stateViewMode === 'log' && viewCache.has(stateCurrentPage))) {
      loadingMessage.value = '';
    }

    if (currentServer && finalSelectedChannel && stateViewMode !== 'config') {
~~~~~
~~~~~javascript.new
    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
    viewCache.setTotalCount(totalCount);

    if (currentServer && finalSelectedChannel && stateViewMode !== 'config') {
~~~~~

#### Acts 3: 强化集成测试的物理隔离

确保 `localStorage.clear()` 发生在一切初始化之前，彻底杜绝数据泄露。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
describe('UI Integration Smoke Tests', () => {
  let mockAppState;
  let activeUI = null;

  afterEach(() => {
    if (activeUI) {
      activeUI.destroy();
      activeUI = null;
    }
  });

  beforeEach(async () => {
    // 物理清理存储，防止跨测试的数据污染 (如 pageSize: 50 导致的 Message 201 错误)
    localStorage.clear();

    await storageManager.init();
~~~~~
~~~~~javascript.new
describe('UI Integration Smoke Tests', () => {
  let mockAppState;
  let activeUI = null;

  beforeEach(() => {
    // 物理清理存储必须是同步且最优先的
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (activeUI) {
      activeUI.destroy();
      activeUI = null;
    }
  });

  beforeEach(async () => {
    await storageManager.init();
~~~~~

### 下一步建议

由于我们已经完成了代码逻辑的原子化重构并增加了严谨的物理隔离，现在运行 `npm run test` 应该会得到全绿的结果。

如果仍有微小波动，建议检查 `tests/ui.integration.test.js` 中 `waitFor` 的超时设置。但在当前的优化下，缓存命中的 `refreshView` 虽然仍有 `await` 点，但已不再会因为 `loadingMessage` 被提前清理而暴露空状态。
