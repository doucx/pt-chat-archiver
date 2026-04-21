非常感谢你的配合！根据测试输出，我们发现了两点需要进一步修复：

1. **测试逻辑的时序冲突**：在 `ui.integration.test.js` 的“在加载过程中发生的滚动不应触发错误解锁”测试中，由于前一个动作（点击最后一页）触发了异步的数据拉取 (`refreshView`)，它在后台会设置和清除 `loadingMessage`。而测试用例通过手动修改 DOM `value` 来模拟滚动，这与后台真实的信号状态 (`loadingMessage.value`) 发生了竞态。当执行最后一步“正常解锁”时，后台的加载其实还没有结束，导致滚动事件被拦截，按钮依然保有 `active` class。
2. **需要将清理逻辑应用到所有集成测试**：正如上一次的“下一步建议”所述，`ui.integration.test.js` 中也需要引入 `activeUI.destroy()` 来避免环境污染。

下面我们将生成计划来修复这些问题。

## [WIP] fix(test): 修复集成测试中的时序竞态条件及内存泄漏

### 错误分析
在 `ui.integration.test.js` 的 `在加载过程中发生的滚动不应触发错误解锁` 测试中，最后断言 `expect(lastBtn).not.toHaveClass('active')` 失败。
根本原因是：
测试点击 `lastBtn` 后，虽然测试代码立即手动覆盖了 `logDisplay.value` 并触发了滚动，但后台由 `currentPage.value` 改变引发的 `refreshView` 仍在执行。当测试进行到第 4 步和第 5 步时，全局状态 `loadingMessage.value` 可能依然是真值（例如 `"⏳ 数据加载..."`）。在 `LogViewer` 的 `handleScroll` 中，由于 `loadingMessage.value` 为真，事件被直接 `return` 掉，解锁逻辑未能执行。

### 用户需求
确保 `tests/ui.integration.test.js` 全部通过，测试环境没有残留。

### 评论
对于异步的副作用（尤其是涉及延时的 UI 反馈），测试用例必须显式地等待状态平息（settled），再进行下一步断言。这在基于信号和异步流的架构中尤为重要。

### 目标
1.  在 `ui.integration.test.js` 中引入 `loadingMessage` 信号，用于精确等待异步加载完成。
2.  在所有测试的最后进行 `destroy()` 清理。

### 基本原理
通过 `waitFor(() => expect(loadingMessage.value).toBe(''))` 确保后台的所有异步读取和渲染都已结束，这时再模拟常规的向上滚动，就不会被 `handleScroll` 中的加载保护机制拦截，从而能够正确验证解锁逻辑。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #concept/navigation #scope/dx #ai/refine #task/domain/testing #task/object/integration-tests #task/action/fix #task/state/begin

---

### Script

#### Acts 1: 修复 `ui.integration.test.js`

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
import { currentPage, isLockedToBottom, viewMode } from '../src/ui/store/uiStore.js';
~~~~~
~~~~~javascript.new
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
import { currentPage, isLockedToBottom, loadingMessage, viewMode } from '../src/ui/store/uiStore.js';
~~~~~
~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
describe('UI Integration Smoke Tests', () => {
  let mockAppState;

  beforeEach(async () => {
    await storageManager.init();
~~~~~
~~~~~javascript.new
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
    await storageManager.init();
~~~~~
~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  it('初始加载时应正确渲染数据和默认频道', async () => {
    await renderUI(mockAppState);

    // 虽然 renderUI 内部已经 await refreshView，但在复杂的测试环境中
~~~~~
~~~~~javascript.new
  it('初始加载时应正确渲染数据和默认频道', async () => {
    activeUI = await renderUI(mockAppState);

    // 虽然 renderUI 内部已经 await refreshView，但在复杂的测试环境中
~~~~~
~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    await renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');
~~~~~
~~~~~javascript.new
  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    activeUI = await renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');
~~~~~
~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  it('在设置中修改分页大小应能实时改变日志显示条数', async () => {
    await renderUI(mockAppState);

    // 1. 进入设置
~~~~~
~~~~~javascript.new
  it('在设置中修改分页大小应能实时改变日志显示条数', async () => {
    activeUI = await renderUI(mockAppState);

    // 1. 进入设置
~~~~~
~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
    await renderUI(mockAppState);
    const lastBtn = screen.getByTitle('跳转并锁定到末尾');
    const logDisplay = screen.getByRole('textbox');

    // 1. 点击末页进入锁定模式
    fireEvent.click(lastBtn);
    // 使用 waitFor 确保即使渲染循环有微小延迟也能通过
    await waitFor(() => expect(lastBtn).toHaveClass('active'));

    // 2. 模拟加载中状态（refreshView 异步流启动）
    // 直接操作 value 模拟 renderer 的中间态
    logDisplay.value = '⏳ 数据加载与处理中...';

    // 模拟由内容变短引起的滚动事件
    // 在锁定状态下，如果 isAtBottom 为假（此时内容只有一行，自然为假），且没有加载保护，会触发解锁
    fireEvent.scroll(logDisplay);

    // 3. 验证：由于加载保护存在，锁定状态不应被移除
    await waitFor(() => {
      expect(lastBtn).toHaveClass('active');
    });

    // 4. 模拟加载完成
    logDisplay.value = 'Line 1\nLine 2\nLine 3';
    // 模拟向上滚动：手动 mock DOM 属性
    Object.defineProperty(logDisplay, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(logDisplay, 'scrollTop', { value: 200, configurable: true, writable: true });
    Object.defineProperty(logDisplay, 'clientHeight', { value: 500, configurable: true });

    fireEvent.scroll(logDisplay);

    // 5. 验证：此时向上滚动可以正常解锁
    await waitFor(() => {
      expect(lastBtn).not.toHaveClass('active');
    });
  });
~~~~~
~~~~~javascript.new
  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
    activeUI = await renderUI(mockAppState);
    const lastBtn = screen.getByTitle('跳转并锁定到末尾');
    const logDisplay = screen.getByRole('textbox');

    // 1. 点击末页进入锁定模式
    fireEvent.click(lastBtn);
    // 使用 waitFor 确保即使渲染循环有微小延迟也能通过
    await waitFor(() => expect(lastBtn).toHaveClass('active'));

    // 2. 模拟加载中状态（refreshView 异步流启动）
    // 直接操作 value 模拟 renderer 的中间态
    logDisplay.value = '⏳ 数据加载与处理中...';

    // 模拟由内容变短引起的滚动事件
    // 在锁定状态下，如果 isAtBottom 为假（此时内容只有一行，自然为假），且没有加载保护，会触发解锁
    fireEvent.scroll(logDisplay);

    // 3. 验证：由于加载保护存在，锁定状态不应被移除
    await waitFor(() => {
      expect(lastBtn).toHaveClass('active');
    });

    // 4. 等待后台真实的 refreshView 完成
    // 必须确保 loadingMessage 被清空，否则后续真实的 scroll 会被拦截
    await waitFor(() => {
      expect(loadingMessage.value).toBe('');
    });

    // 模拟向上滚动：手动 mock DOM 属性
    Object.defineProperty(logDisplay, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(logDisplay, 'scrollTop', { value: 200, configurable: true, writable: true });
    Object.defineProperty(logDisplay, 'clientHeight', { value: 500, configurable: true });

    fireEvent.scroll(logDisplay);

    // 5. 验证：此时向上滚动可以正常解锁
    await waitFor(() => {
      expect(lastBtn).not.toHaveClass('active');
    });
  });
~~~~~

### 下一步建议
再次运行所有的测试。通过这次修复，我们清理了环境并修正了最后可能的竞态条件，这应该能让测试全面并且稳定地通过。
