这是一个典型的异步重构过渡期问题。你的测试用例和部分运行时逻辑还没跟上存储层从“同步对象”向“异步 Promise”转型的步伐。

1.  **测试用例 Mock 滞后**: `tests/ui.clean_duplicates.test.js` 中的 `createMockAdapter` 仍然在返回同步的 `state` 对象。当 `renderer.js` 尝试调用 `.then()` 时，由于对象没有该方法，直接抛出 `TypeError`。这导致了 Vitest 的 7 个未处理错误。
2.  **IDBKeyRange 关键错误**: 报错 `DataError: Failed to execute 'bound' on 'IDBKeyRange'`。这是因为在应用初始化瞬间，`detectedServerName` 可能还是 `null`。在复合索引查询中，IndexedDB 要求数组中的每一个元素都必须是有效的 Key（不能是 `undefined` 或 `null`）。
3.  **UI 挂起**: 由于 `refreshView` 是一个 `async` 函数，其中任何一个数据库查询报错且未被捕获，都会导致整个 Promise 链中断，渲染逻辑彻底停止，表现为设置页面打不开、数据不显示。

我将生成修复计划，重点在于增强存储层的鲁棒性（防空保护）并同步更新测试用例。

## [WIP] fix: 修复存储层异步转型导致的 IDB 查询崩溃与测试失败

### 错误分析

**1. IDBKeyRange 崩溃**
在 `IndexedDBAdapter.getChannels(server)` 和 `getMessages` 中，代码直接构造了 `IDBKeyRange.bound([server, ...])`。当 `server` 为 `null` 时，IndexedDB 引擎会因为无法对 `null` 进行排序而抛出致命异常。

**2. 测试兼容性**
`renderer.js` 现在严格要求 `getRawState` 返回一个 `Promise`。现有测试用例中的 Mock 返回的是同步数据，违反了契约。

**3. 渲染中断**
`ui/index.js` 中的 `refreshView` 缺乏对 `server` 或 `channel` 不存在时的短路保护。

### 用户需求
修复因数据库异步化重构导致的界面挂起和测试报错，确保系统在初始状态下能正常运行。

### 评论
在处理 IndexedDB 复合索引时，必须时刻保持“防御性编程”意识。永远不要假设输入参数是合法的。这次修复将引入严格的参数校验，并补齐测试用例的异步契约。

### 目标
1. 在 `IndexedDBAdapter` 的所有索引查询方法中加入参数有效性检查。
2. 更新 `tests/ui.clean_duplicates.test.js`，将 Mock Adapter 的所有方法改为 `async`（返回 Promise）。
3. 增强 `ui/index.js` 中的 `refreshView` 逻辑，确保在数据未就绪时优雅降级。

### 标签
#intent/fix #flow/ready #priority/critical #comp/engine #comp/tests #scope/core #ai/instruct #task/domain/storage #task/object/indexed-db #task/action/bug-fix #task/state/continue

---

### Script

#### Acts 1: 增强 IndexedDBAdapter 的鲁棒性
在执行 `IDBKeyRange.bound` 之前，必须确保 `server` 和 `channel` 不是空值。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
  getChannels(server) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
~~~~~
~~~~~javascript
  getChannels(server) {
    if (!server) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
  getMessages(server, channel, page, pageSize) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
~~~~~
~~~~~javascript
  getMessages(server, channel, page, pageSize) {
    if (!server || !channel) return Promise.resolve({ messages: [], total: 0 });
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
  getLatestMessages(server, channel, limit) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
~~~~~
~~~~~javascript
  getLatestMessages(server, channel, limit) {
    if (!server || !channel) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
~~~~~

#### Acts 2: 更新 UI 控制器的防御逻辑
在 `refreshView` 中增加对 `currentServer` 的前置判断。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript
  const refreshView = async () => {
    const { viewingServer, currentPage, pageSize, viewMode, isLockedToBottom } = uiState.getState();
    const serverList = await dataAdapter.getServers();

    // 确保 viewingServer 有效
    if (!viewingServer && serverList.length > 0) {
      uiState.setViewingServer(serverList[0]);
    }
    const currentServer = uiState.getState().viewingServer; // 可能已被上面更新

    // 获取当前服务器的频道列表和统计信息
    const channelList = await dataAdapter.getChannels(currentServer);
~~~~~
~~~~~javascript
  const refreshView = async () => {
    const { viewingServer, currentPage, pageSize, viewMode, isLockedToBottom } = uiState.getState();
    const serverList = await dataAdapter.getServers();

    // 确保 viewingServer 有效
    if (!viewingServer && serverList.length > 0) {
      uiState.setViewingServer(serverList[0]);
    }
    const currentServer = uiState.getState().viewingServer;

    if (!currentServer) {
      // 如果没有任何服务器数据，渲染空上下文
      return renderer.render({
        serverList,
        channelList: [],
        channelCounts: {},
        messages: [],
        totalCount: 0,
      }, uiCallbacks);
    }

    // 获取当前服务器的频道列表和统计信息
    const channelList = await dataAdapter.getChannels(currentServer);
~~~~~

#### Acts 3: 同步更新测试用例中的 Mock 契约
将测试用例中的同步 Mock 改为异步，以匹配 `renderer.js` 的期望。

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript
  getAllData: async () => state,
  getRawState: () => state,
});
~~~~~
~~~~~javascript
  getAllData: async () => state,
  getRawState: async () => state,
});
~~~~~

### 下一步建议

现在你可以重新运行 `npm test`，理论上 7 个未处理错误和相关的测试失败应当消失。

**特别注意**: 
虽然我们现在解决了“查重按钮导致崩溃”的问题，但你应该注意到在 `ui/index.js` 的 `cleanChannelRecords` 方法中，我们依然在使用 `const rawState = await dataAdapter.getRawState()`。这意味着系统仍然会临时在内存中加载一个完整的数据快照来执行查重计算。

这正是我们在 Phase 2 结尾处提到的**债务**。在进入 Phase 3 (Worker) 之前，建议先完成 Phase 2.3 的 **Metadata Store**（维护每个频道的 count 统计），这样 `refreshView` 就不用每次都调用昂贵的 `index.count()` 了。
