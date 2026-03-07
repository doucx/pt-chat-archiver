由于我们在 Phase 1 中将 UI 与数据层解耦并引入了 `DataAdapter` 接口，原有的测试用例仍然在向 `createUI` 传递旧的同步 `state` 对象，这导致了 `TypeError: dataAdapter.getAllData is not a function`。

我将生成一个计划来修复 `src/ui/index.js` 中的回调传递，并更新测试套件以匹配新的异步接口。

## [WIP] fix(tests): 适配 UI 异步 DataAdapter 接口并修复回归

### 错误分析
1.  **接口不匹配**: `createUI` 现在期望接收一个 `DataAdapter` 对象，但测试用例仍传递 `mockAppState` (Plain Object)。
2.  **回调缺失**: `src/ui/index.js` 在构建 `uiCallbacks` 时，忘记将 `dataAdapter.getRawState` 传递给 Renderer，导致查重按钮的计数逻辑（依赖该方法访问数据进行分析）在测试中无法获取数据。

### 用户需求
修复测试失败，确保重构后的 UI 逻辑在异步环境下依然正确，且维持原有的查重等功能的兼容性。

### 评论
在 Phase 1 阶段，我们依然保留了部分功能的“全量数据依赖”（如查重分析和导出），因此适配器必须提供这些兼容方法。测试用例也需要通过 Mock 适配器来模拟真实的运行环境。

### 目标
1.  修正 `src/ui/index.js`，将 `dataAdapter.getRawState` 暴露给 `uiCallbacks`，使 Renderer 能够进行查重计数。
2.  更新 `tests/ui.clean_duplicates.test.js`，实现 `createMockAdapter` 辅助函数。
3.  更新 `tests/ui.integration.test.js`，实现 `createMockAdapter` 辅助函数。

### 基本原理
在测试中，我们构建一个简单的同步封装器来满足 `DataAdapter` 的异步接口。由于 `inMemoryState` 本身是同步的，这种包装可以极低成本地模拟异步行为，确保测试逻辑在不改变原有断层检测逻辑的情况下通过。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #comp/ui #scope/core #ai/instruct #task/domain/testing #task/object/async-adapter-fix #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 修复 `src/ui/index.js` 中的回调传递

确保查重分析模块能够访问到数据。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~old
  const uiCallbacks = {
    ...appCallbacks,
    cleanChannelRecords,
    clearAllData,
    importAllData,
~~~~~
~~~~~new
  const uiCallbacks = {
    ...appCallbacks,
    getRawState: dataAdapter.getRawState, // 必须提供给分析模块
    cleanChannelRecords,
    clearAllData,
    importAllData,
~~~~~

#### Acts 2: 修复 `tests/ui.clean_duplicates.test.js`

我们需要在测试中构造一个 Mock Adapter。

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~old
global.__APP_VERSION__ = '7.0.0-test';

describe('UI Clean Duplicates Regression (V6)', () => {
~~~~~
~~~~~new
global.__APP_VERSION__ = '7.0.0-test';

const createMockAdapter = (state) => ({
  getServers: async () => Object.keys(state),
  getChannels: async (server) => Object.keys(state[server] || {}),
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
    const start = (page - 1) * pageSize;
    return {
      messages: list.slice(start, start + pageSize),
      total: list.length,
    };
  },
  getAllData: async () => state,
  getRawState: () => state,
});

describe('UI Clean Duplicates Regression (V6)', () => {
~~~~~

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~old
  it('应当能正确识别跨服务器的重复项并在 UI 按钮上显示总数', async () => {
    const ui = await createUI(mockAppState, mockCallbacks);
    ui.updateServerDisplay('Server A');
~~~~~
~~~~~new
  it('应当能正确识别跨服务器的重复项并在 UI 按钮上显示总数', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');
~~~~~

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~old
  it('点击清理按钮应当递归处理嵌套结构并保存结果', async () => {
    const ui = await createUI(mockAppState, mockCallbacks);
    ui.updateServerDisplay('Server A');
~~~~~
~~~~~new
  it('点击清理按钮应当递归处理嵌套结构并保存结果', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');
~~~~~

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~old
  it('当没有重复项时，点击按钮应当给出提示', async () => {
    // 构造一个没有重复的状态
    const cleanState = { S1: { L1: [{ content: 'unique', time: new Date().toISOString() }] } };
    await createUI(cleanState, mockCallbacks);

    fireEvent.click(screen.getByTitle('设置'));
~~~~~
~~~~~new
  it('当没有重复项时，点击按钮应当给出提示', async () => {
    // 构造一个没有重复的状态
    const cleanState = { S1: { L1: [{ content: 'unique', time: new Date().toISOString() }] } };
    const adapter = createMockAdapter(cleanState);
    await createUI(adapter, mockCallbacks);

    fireEvent.click(screen.getByTitle('设置'));
~~~~~

#### Acts 3: 修复 `tests/ui.integration.test.js`

同步更新集成测试。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~old
const mockCallbacks = {
  scanAndMergeHistory: vi.fn(() => Promise.resolve()),
  saveMessagesToStorage: vi.fn(() => Promise.resolve()),
  cleanChannelRecords: vi.fn(),
  detectTotalDuplicates: vi.fn(() => 0),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(() => Promise.resolve()),
  onAutoSaveIntervalChange: vi.fn(),
};

async function renderUI(initialState) {
  document.body.innerHTML = '';
  const ui = await createUI(initialState, mockCallbacks);
  ui.updateServerDisplay('Test Server');
  return ui;
}
~~~~~
~~~~~new
const mockCallbacks = {
  scanAndMergeHistory: vi.fn(() => Promise.resolve()),
  saveMessagesToStorage: vi.fn(() => Promise.resolve()),
  cleanChannelRecords: vi.fn(),
  detectTotalDuplicates: vi.fn(() => 0),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(() => Promise.resolve()),
  onAutoSaveIntervalChange: vi.fn(),
};

const createMockAdapter = (state) => ({
  getServers: async () => Object.keys(state),
  getChannels: async (server) => Object.keys(state[server] || {}),
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
    const start = (page - 1) * pageSize;
    return {
      messages: list.slice(start, start + pageSize),
      total: list.length,
    };
  },
  getAllData: async () => state,
  getRawState: () => state,
});

async function renderUI(initialState) {
  document.body.innerHTML = '';
  const adapter = createMockAdapter(initialState);
  const ui = await createUI(adapter, mockCallbacks);
  ui.updateServerDisplay('Test Server');
  return ui;
}
~~~~~

### 下一步建议
修复完测试后，我们确信异步渲染管道已经稳健地建立。接下来可以正式开始 **Phase 2**，将 `main.js` 中的全量 `inMemoryChatState` 移除，将 `DataAdapter` 的实现改为真正的 IndexedDB 增量请求。
