简要回答：
我已经找到了导致测试依然失败的根本原因。核心问题在于 **Preact Signals 的全局状态在测试之间发生了泄漏 (Bleeding)**。

由于 `viewMode`、`currentPage` 等信号被定义为全局变量，当上一个测试将 `viewMode` 设为 `'config'` 后，后续的测试会继承这个状态。这导致：
1. **`ui.clean_duplicates.test.js`**: 第二个测试刚开始时 `viewMode` 已经是 `'config'`，然后点击“设置”反而将其切换成了 `'log'`（隐藏了设置面板），导致后续找不到扫描和清理按钮。
2. **`ui.integration.test.js`**: 测试之间的状态混乱导致组件条件渲染不符合预期，`toBeVisible()` 判断失败（因为处于 `'log'` 模式时 `<ConfigPanel>` 根本没有挂载到 DOM 上，`getElementById` 返回 `null`）。

我将通过在 `beforeEach` 中重置这些全局信号来彻底解决此问题，并对测试用例的断言方式进行优化以适配 Preact 的异步渲染。

## [WIP] fix(tests): 解决 UI 状态在测试间泄漏及断言失效的问题

### 用户需求
修复剩余的 UI 集成测试失败问题，确保测试用例在互相隔离的可靠环境下运行。

### 评论
使用全局状态库（如 Preact Signals、Redux）时，测试用例之间的状态隔离是非常常见的痛点。在 `beforeEach` 中显式地将状态重置为初始值是一种标准且健壮的解决方案。另外，由于 Preact 渲染带有一定的异步批处理特性，使用 `findBy*` 替代 `getBy*` 可以避免因 DOM 尚未更新完毕而导致的偶尔失败。

### 目标
1. 在 `ui.integration.test.js` 的 `beforeEach` 中重置 `viewMode`, `currentPage`, `isLockedToBottom`。
2. 在 `ui.clean_duplicates.test.js` 的 `beforeEach` 中重置 `viewMode`。
3. 优化 DOM 断言：对于条件渲染的组件，使用 `toBeNull()` 代替对 `null` 元素调用 `not.toBeVisible()`。
4. 使用 `findByLabelText` 和 `getByTitle` 使元素获取更加稳定。

### 基本原理
- 每次测试运行前重置全局信号变量，确保每个测试都在一个纯净的 `'log'` 视图下开始。
- 只有存在于 DOM 树中的元素才能使用 `.toBeVisible()`。如果组件因条件渲染而被卸载，必须断言它为 `null`。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #concept/state #scope/dx #ai/instruct #task/domain/ui #task/object/preact-migration #task/action/fix #task/state/end

---

### Script

#### Acts 1: 修复 `ui.integration.test.js`
导入 Signals 并重置，调整断言逻辑。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';
~~~~~
~~~~~javascript.new
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
import { viewMode, currentPage, isLockedToBottom } from '../src/ui/store/uiStore.js';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  beforeEach(async () => {
    await storageManager.init();
    mockAppState = {
~~~~~
~~~~~javascript.new
  beforeEach(async () => {
    await storageManager.init();
    viewMode.value = 'log';
    currentPage.value = 1;
    isLockedToBottom.value = false;
    mockAppState = {
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    await renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');
    const logView = document.getElementById('log-archive-log-view');
    const configView = document.getElementById('log-archive-config-view');

    // 初始状态
    expect(logView).toBeVisible();
    expect(configView).not.toBeVisible();

    // 点击设置 (触发异步刷新)
    fireEvent.click(settingsButton);

    // 必须使用 waitFor 等待异步 DOM 变更
    await waitFor(() => {
      expect(logView).not.toBeVisible();
      expect(configView).toBeVisible();
    });

    // 再次点击切回
    fireEvent.click(settingsButton);
    await waitFor(() => {
      expect(logView).toBeVisible();
    });
  });
~~~~~
~~~~~javascript.new
  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    await renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');

    // 初始状态 (ConfigPanel 未挂载)
    expect(document.getElementById('log-archive-log-view')).toBeVisible();
    expect(document.getElementById('log-archive-config-view')).toBeNull();

    // 点击设置 (触发异步刷新)
    fireEvent.click(settingsButton);

    // 必须使用 waitFor 等待异步 DOM 变更
    await waitFor(() => {
      expect(document.getElementById('log-archive-log-view')).toBeNull();
      expect(document.getElementById('log-archive-config-view')).toBeVisible();
    });

    // 再次点击切回
    fireEvent.click(settingsButton);
    await waitFor(() => {
      expect(document.getElementById('log-archive-log-view')).toBeVisible();
    });
  });
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  it('在设置中修改分页大小应能实时改变日志显示条数', async () => {
    await renderUI(mockAppState);

    // 1. 进入设置
    fireEvent.click(screen.getByTitle('设置'));

    // 2. 找到分页大小输入框并改为 50
    const pageSizeInput = screen.getByLabelText(/分页大小/);
    fireEvent.change(pageSizeInput, { target: { value: '50' } });
~~~~~
~~~~~javascript.new
  it('在设置中修改分页大小应能实时改变日志显示条数', async () => {
    await renderUI(mockAppState);

    // 1. 进入设置
    fireEvent.click(screen.getByTitle('设置'));

    // 2. 找到分页大小输入框并改为 50 (等待渲染完成)
    const pageSizeInput = await screen.findByLabelText(/分页大小/);
    fireEvent.change(pageSizeInput, { target: { value: '50' } });
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
    await renderUI(mockAppState);
    const lastBtn = screen.getByText('»');
    const logDisplay = screen.getByRole('textbox');
~~~~~
~~~~~javascript.new
  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
    await renderUI(mockAppState);
    const lastBtn = screen.getByTitle('跳转并锁定到末尾');
    const logDisplay = screen.getByRole('textbox');
~~~~~

#### Acts 2: 修复 `ui.clean_duplicates.test.js`
导入 Signal 并重置，防止视图模式跨用例泄漏。

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';
~~~~~
~~~~~javascript.new
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
import { viewMode } from '../src/ui/store/uiStore.js';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';
~~~~~

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
  beforeEach(async () => {
    document.body.innerHTML = '';
    await storageManager.init();

    // 1. 构造 Mock 状态
~~~~~
~~~~~javascript.new
  beforeEach(async () => {
    document.body.innerHTML = '';
    await storageManager.init();
    viewMode.value = 'log';

    // 1. 构造 Mock 状态
~~~~~
