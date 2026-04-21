你的分析非常敏锐。这个错误是一个典型的**异步竞态条件**导致的：在测试执行完毕后，JSDOM 环境已经卸载（`document` 变得不可用），但由于 `updateRecordingStatus` 中调用 `refreshView()` 时没有使用 `await`，导致该异步任务成为了一个“漂浮的 Promise”。当它最终执行到 `renderer.render` 尝试操作 DOM 时，环境已经消失了。

为了彻底解决这个问题并增强系统的稳定性，我们需要将 `createUI` 返回的公共 API 异步化，确保外部（尤其是测试）可以等待 UI 更新完成。

## [WIP] fix: 修复 UI 模块中的浮动 Promise 并同步 Preact 挂载逻辑

### 错误分析
在 `src/ui/index.js` 中，`updateUI`、`setState` 和 `updateRecordingStatus` 等方法内部调用了异步的 `refreshView()`，但没有进行 `await` 或返回该 Promise。
在 `vitest` 环境下，测试用例在调用这些方法后立即结束并销毁了 `document`。随后，先前触发的 `refreshView` 任务尝试访问 `document.createElement`，导致 `ReferenceError: document is not defined`。

### 用户需求
修复异步调用不规范导致的测试失败，并按照重构路线图，正式将 Preact 应用挂载到 DOM 中。

### 评论
这不仅是修复 Bug，更是重构的关键一步。通过将公共 API 异步化，我们让 UI 层的生命周期变得可预测。同时，正式挂载 Preact 标志着新旧渲染引擎开始并存。

### 目标
1.  将 `createUI` 返回的 API 方法（`updateUI`, `setState`, `updateRecordingStatus`）改为 `async` 并 `await refreshView()`。
2.  在 `createUI` 中正式挂载 Preact `App` 组件到 UI 容器。
3.  更新 `ui.clean_duplicates.test.js` 和 `ui.integration.test.js` 以 `await` 状态更新操作，消除未捕获的错误。

### 标签
#intent/fix #flow/ready #priority/high 
#comp/ui #comp/tests #concept/state #scope/dx 
#ai/refine
#task/domain/ui #task/object/async-reliability #task/action/bug-fix 
#task/state/continue #task/status/active

---

### Script

#### Acts 1: 异步化公共 API 并挂载 Preact

我们将修复 `src/ui/index.js` 中的异步调用，并引入 `render` 函数将 Preact 挂载到容器中。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
~~~~~
~~~~~javascript.new
import { render } from 'preact';
import { App } from './App.jsx';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  await bindUIEvents({
    dom,
    uiState,
    refreshView,
    callbacks: uiCallbacks,
  });

  // 4. Initial Render
  // 必须等待首屏渲染完成，确保 UI 实例返回时 DOM 已就绪
  await refreshView();

  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        refreshView();
      }
    },
    onNewMessage: (msg) => {
      viewCache.pushNewMessage(msg);
    },
    invalidateCache: () => {
      viewCache.clear();
    },
    setState: (newState) => {
      refreshView();
    },
    checkStorageUsage: async () => await renderer.checkStorageUsage(),
    isUIPaused: () => uiState.getState().isUIPaused,
    getInitDebounceMs: () => uiState.getState().initDebounceMs,
    updateRecordingStatus: (serverName, channelName) => {
      uiState.setRecordingStatus(serverName, channelName);
      refreshView();
    },
  };
}
~~~~~
~~~~~javascript.new
  await bindUIEvents({
    dom,
    uiState,
    refreshView,
    callbacks: uiCallbacks,
  });

  // 4. Preact Mounting
  // 正式将 Preact 渲染引擎挂载到 DOM 容器中
  render(<App dataAdapter={dataAdapter} appCallbacks={uiCallbacks} />, dom.uiContainer);

  // 5. Initial Render
  // 必须等待首屏渲染完成，确保 UI 实例返回时 DOM 已就绪
  await refreshView();

  // 6. Return the public API
  return {
    updateUI: async () => {
      if (!uiState.getState().isUIPaused) {
        await refreshView();
      }
    },
    onNewMessage: (msg) => {
      viewCache.pushNewMessage(msg);
    },
    invalidateCache: () => {
      viewCache.clear();
    },
    setState: async (newState) => {
      await refreshView();
    },
    checkStorageUsage: async () => await renderer.checkStorageUsage(),
    isUIPaused: () => uiState.getState().isUIPaused,
    getInitDebounceMs: () => uiState.getState().initDebounceMs,
    updateRecordingStatus: async (serverName, channelName) => {
      uiState.setRecordingStatus(serverName, channelName);
      await refreshView();
    },
  };
}
~~~~~

#### Acts 2: 修正测试用例中的异步调用

为了配合 API 的变更并消除 Vitest 的警告，我们需要在测试中 `await` 状态更新。

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
  it('点击扫描后应能正确识别重复项并改变按钮状态为清理', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateRecordingStatus('Server A', 'Local');

    // 进入设置页面
~~~~~
~~~~~javascript.new
  it('点击扫描后应能正确识别重复项并改变按钮状态为清理', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    await ui.updateRecordingStatus('Server A', 'Local');

    // 进入设置页面
~~~~~

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
  it('点击清理按钮应当执行删除逻辑并重置 UI', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateRecordingStatus('Server A', 'Local');

    fireEvent.click(screen.getByTitle('设置'));
~~~~~
~~~~~javascript.new
  it('点击清理按钮应当执行删除逻辑并重置 UI', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    await ui.updateRecordingStatus('Server A', 'Local');

    fireEvent.click(screen.getByTitle('设置'));
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
async function renderUI(initialState) {
  document.body.innerHTML = '';
  const adapter = createMockAdapter(initialState);
  const ui = await createUI(adapter, mockCallbacks);
  ui.updateRecordingStatus('Test Server', 'Local');
  return ui;
}
~~~~~
~~~~~javascript.new
async function renderUI(initialState) {
  document.body.innerHTML = '';
  const adapter = createMockAdapter(initialState);
  const ui = await createUI(adapter, mockCallbacks);
  await ui.updateRecordingStatus('Test Server', 'Local');
  return ui;
}
~~~~~

### 下一步建议
通过上述修改，测试中的 `document is not defined` 报错应该会消失，因为我们确保了在测试环境销毁前，所有的 UI 更新 Promise 均已完成结算。

接下来，我们将继续完成：
1.  **实现 `ConfigPanel.jsx`**：利用 Signals 直接绑定设置项。
2.  **清理 `templates.js`**：由于 Preact 已经挂载并开始接管渲染，我们可以开始逐步移除 `templates.js` 中那些已经组件化的 HTML 字符串。
