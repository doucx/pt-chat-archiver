## [WIP] fix(tests): 修复性能优化后引起的测试回归错误

### 错误分析
性能优化引入了 `getChannelCount` 接口，但未同步更新测试用的 Mock 对象，导致 `refreshView` 在测试运行时由于找不到该函数而崩溃。

### 用户需求
修复由于接口变更导致的自动化测试失败。

### 评论
接口变更时同步更新测试代码是标准流程。同时，在 UI 层增加一个小的降级逻辑可以提高系统的健壮性，防止未来其他环境（如导入/导出插件）出现类似问题。

### 目标
1. 更新 `tests/ui.clean_duplicates.test.js` 和 `tests/ui.integration.test.js` 中的 Mock 适配器。
2. 在 `src/ui/index.js` 中添加接口存在性检查。

### 基本原理
通过在测试 Mock 中返回 `state[server][channel].length` 来快速实现统计接口。在 UI 层，利用可选链或逻辑判断确保即使适配器较旧也能正常工作。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #comp/ui #scope/core #ai/instruct #task/domain/testing #task/object/test-mocks #task/action/fix #task/state/continue

---

### Script

#### Acts 1: 修复 `ui.clean_duplicates.test.js` 中的 Mock

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
const createMockAdapter = (state) => ({
  getServers: async () => Object.keys(state),
  getChannels: async (server) => Object.keys(state[server] || {}),
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
~~~~~
~~~~~javascript.new
const createMockAdapter = (state) => ({
  getServers: async () => Object.keys(state),
  getChannels: async (server) => Object.keys(state[server] || {}),
  getChannelCount: async (server, channel) => (state[server]?.[channel] || []).length,
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
~~~~~

#### Acts 2: 修复 `ui.integration.test.js` 中的 Mock

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
const createMockAdapter = (state) => ({
  getServers: async () => Object.keys(state),
  getChannels: async (server) => Object.keys(state[server] || {}),
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
~~~~~
~~~~~javascript.new
const createMockAdapter = (state) => ({
  getServers: async () => Object.keys(state),
  getChannels: async (server) => Object.keys(state[server] || {}),
  getChannelCount: async (server, channel) => (state[server]?.[channel] || []).length,
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
~~~~~

#### Acts 3: 在 UI 控制器中添加降级防御

即使 Mock 没修好，这里也不会报错。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    // 使用 Promise.all 并行获取各个频道的总数，极大提升刷新速度
    await Promise.all(
      channelList.map(async (ch) => {
        channelCounts[ch] = await dataAdapter.getChannelCount(currentServer, ch);
      })
    );
~~~~~
~~~~~javascript.new
    // 使用 Promise.all 并行获取各个频道的总数，极大提升刷新速度
    await Promise.all(
      channelList.map(async (ch) => {
        if (dataAdapter.getChannelCount) {
          channelCounts[ch] = await dataAdapter.getChannelCount(currentServer, ch);
        } else {
          // 降级方案：如果适配器未实现此接口，回落到查询第一页来获取 total
          const { total } = await dataAdapter.getMessages(currentServer, ch, 1, 1);
          channelCounts[ch] = total;
        }
      })
    );
~~~~~

### 下一步建议
修复后请重新运行测试（`npm test`）。在确认所有测试通过后，我们可以继续进行功能完善或准备提交。
