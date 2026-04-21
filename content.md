你的分析非常准确。在 Vitest/JSDOM 环境中，`close timed out` 错误通常是由于测试结束后仍有未清理的**异步句柄**（如 `setTimeout`、未停止的 `MutationObserver` 或未销毁的 Preact `effect`）导致的。

经过对代码的审查，发现以下几个导致泄露和卡死的核心原因：
1.  **`ConfigPanel` 的定时器泄露**：在 `handleScanDuplicates` 中，当没有重复项时会开启一个 1500ms 的 `setTimeout`。测试用例在断言“未发现重复”后立即结束，但这个定时器仍在运行。
2.  **Preact Signals `effect` 泄露**：`src/ui/index.jsx` 中创建了一个全局 `effect`。由于没有调用它返回的 `dispose` 函数，即使测试清空了 `document.body`，该效应器依然在后台监听信号并触发 `refreshView`。
3.  **Preact 树未卸载**：测试中多次调用 `createUI` 并通过 `render()` 挂载 DOM，但从未调用 `render(null, container)` 显式卸载，导致内存中保留了大量的 Preact 实例引用。

我将通过以下计划修复这些问题：

## [WIP] fix(test): 修复测试卡死及环境清理超时的回归问题

### 错误分析
测试日志显示 `Duration 19.10s` 且 `close timed out after 10000ms`。这说明：
1.  **资源泄露**：某个测试用例留下了存活的异步任务。在 `ui.clean_duplicates.test.js` 的第三个测试中，点击扫描后触发的 `setTimeout(..., 1500)` 在测试断言完成后仍挂在事件循环中。
2.  **效应器冲突**：`createUI` 内部的 `effect` 会在每次信号变化时尝试执行 `refreshView`。由于测试环境并发运行，未销毁的旧 `effect` 可能会干扰新测试的数据状态。
3.  **双重刷新逻辑**：`createUI` 在初始化时手动执行了一次 `await refreshView()`，随后又立即启动了一个会自动执行一次的 `effect`。这在某些环境下会导致竞态条件。

### 用户需求
修复 `tests/ui.clean_duplicates.test.js` 中的测试卡死问题，确保测试套件能够稳定、快速地通过。

### 评论
在基于信号（Signals）和异步渲染的复杂 UI 框架中，显式的销毁逻辑（Teardown）与业务逻辑同样重要。这不仅是为了通过测试，也是为了防止用户在频繁打开/关闭 UI 时产生内存溢出。

### 目标
1.  在 `ConfigPanel.jsx` 中增加定时器清理逻辑。
2.  在 `src/ui/index.jsx` 的返回接口中暴露 `destroy` 方法，负责清理 `effect` 和卸载 Preact。
3.  更新 `tests/ui.clean_duplicates.test.js`，确保每个测试结束后都进行彻底的清理。
4.  消除 `createUI` 初始化时的冗余 `refreshView` 调用。

### 基本原理
通过 `useRef` 追踪功能性定时器，并在组件卸载时清理。在 UI 入口处捕获 `effect` 句柄，并将其与 Preact 的卸载过程（`render(null, container)`）封装在一起，确保测试环境能够干净地重置。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #comp/ui #concept/navigation #scope/dx #ai/refine #task/domain/testing #task/object/test-leaks #task/action/fix #task/state/begin

---

### Script

#### Acts 1: 修复 `ConfigPanel.jsx` 的定时器泄露

我们将使用 `useRef` 来管理清理任务。

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
import { useEffect, useState } from 'preact/hooks';
import { MigrationManager } from '../../migrations.js';
~~~~~
~~~~~javascript.new
import { useEffect, useRef, useState } from 'preact/hooks';
import { MigrationManager } from '../../migrations.js';
~~~~~
~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
  const [scanState, setScanState] = useState('idle');
  const [duplicateIds, setDuplicateIds] = useState([]);

  const handleScanDuplicates = async () => {
    if (scanState === 'idle' || scanState === 'no_duplicates' || scanState === 'done') {
      setScanState('scanning');
      try {
        const ids = await callbacks.scanDuplicates();
        if (ids.length === 0) {
          setScanState('no_duplicates');
          setTimeout(() => setScanState('idle'), 1500);
        } else {
          setDuplicateIds(ids);
          setScanState('pending');
        }
      } catch (e) {
        setScanState('idle');
      }
    } else if (scanState === 'pending') {
      if (
        confirm(`【确认】将删除 ${duplicateIds.length} 条重复记录。此操作不可逆。确定要继续吗？`)
      ) {
        setScanState('cleaning');
        await callbacks.deleteMessages(duplicateIds);
        setScanState('done');
        setDuplicateIds([]);
        setTimeout(() => setScanState('idle'), 1500);
      }
    }
  };
~~~~~
~~~~~javascript.new
  const [scanState, setScanState] = useState('idle');
  const [duplicateIds, setDuplicateIds] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleScanDuplicates = async () => {
    if (scanState === 'idle' || scanState === 'no_duplicates' || scanState === 'done') {
      setScanState('scanning');
      try {
        const ids = await callbacks.scanDuplicates();
        if (ids.length === 0) {
          setScanState('no_duplicates');
          timerRef.current = setTimeout(() => setScanState('idle'), 1500);
        } else {
          setDuplicateIds(ids);
          setScanState('pending');
        }
      } catch (e) {
        setScanState('idle');
      }
    } else if (scanState === 'pending') {
      if (
        confirm(`【确认】将删除 ${duplicateIds.length} 条重复记录。此操作不可逆。确定要继续吗？`)
      ) {
        setScanState('cleaning');
        await callbacks.deleteMessages(duplicateIds);
        setScanState('done');
        setDuplicateIds([]);
        timerRef.current = setTimeout(() => setScanState('idle'), 1500);
      }
    }
  };
~~~~~

#### Acts 2: 完善 `src/ui/index.jsx` 的清理接口

暴露 `destroy` 方法，并消除初始化时的多余刷新。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
  // Initial Data Fetch
  await refreshView();

  // 响应式数据拉取驱动
  effect(() => {
    // 订阅关键路由信号
    const s = viewingServer.value;
    const c = selectedChannel.value;
    const p = currentPage.value;
    const sz = pageSize.value;
    const m = viewMode.value;

    // 使用 untracked 避免 refreshView 内部的读取操作造成循环订阅
    untracked(() => {
      // 首次加载已在上面手动执行，这里只响应后续变化
      // 通过对比当前状态防止冗余刷新
      refreshView();
    });
  });

  // Return Engine API
  return {
    updateUI: async () => {
      if (!isUIPaused.value) {
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
      // 状态由外部修改后，effect 会自动处理刷新
    },
    checkStorageUsage: async () => {}, // Stubs for removed checks
    isUIPaused: () => isUIPaused.value,
    getInitDebounceMs: () => initDebounceMs.value,
    updateRecordingStatus: async (serverName, channelName) => {
      // 仅修改信号，触发全局 effect 刷新数据
      setRecordingStatus(serverName, channelName);
    },
  };
}
~~~~~
~~~~~javascript.new
  // 响应式数据拉取驱动：effect 会在创建时自动同步触发一次 refreshView
  const stopEffect = effect(() => {
    // 订阅关键路由信号
    const s = viewingServer.value;
    const c = selectedChannel.value;
    const p = currentPage.value;
    const sz = pageSize.value;
    const m = viewMode.value;

    // 使用 untracked 避免 refreshView 内部的读取操作造成循环订阅
    untracked(() => {
      refreshView();
    });
  });

  // Return Engine API
  return {
    destroy: () => {
      stopEffect();
      render(null, container);
      container.remove();
      toggleButton.remove();
    },
    updateUI: async () => {
      if (!isUIPaused.value) {
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
      // 状态由外部修改后，effect 会自动处理刷新
    },
    checkStorageUsage: async () => {}, // Stubs for removed checks
    isUIPaused: () => isUIPaused.value,
    getInitDebounceMs: () => initDebounceMs.value,
    updateRecordingStatus: async (serverName, channelName) => {
      // 仅修改信号，触发全局 effect 刷新数据
      setRecordingStatus(serverName, channelName);
    },
  };
}
~~~~~

#### Acts 3: 更新 `ui.clean_duplicates.test.js` 以支持销毁

确保测试环境在每个 `it` 块结束后都重置到干净状态。

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
describe('UI Clean Duplicates Regression (V6)', () => {
  let mockAppState;
  let mockCallbacks;

  beforeEach(async () => {
    document.body.innerHTML = '';
    await storageManager.init();
~~~~~
~~~~~javascript.new
describe('UI Clean Duplicates Regression (V6)', () => {
  let mockAppState;
  let mockCallbacks;
  let activeUI = null;

  afterEach(() => {
    if (activeUI) {
      activeUI.destroy();
      activeUI = null;
    }
  });

  beforeEach(async () => {
    document.body.innerHTML = '';
    await storageManager.init();
~~~~~
~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
  it('点击扫描后应能正确识别重复项并改变按钮状态为清理', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    await ui.updateRecordingStatus('Server A', 'Local');
~~~~~
~~~~~javascript.new
  it('点击扫描后应能正确识别重复项并改变按钮状态为清理', async () => {
    const adapter = createMockAdapter(mockAppState);
    activeUI = await createUI(adapter, mockCallbacks);
    await activeUI.updateRecordingStatus('Server A', 'Local');
~~~~~
~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
  it('点击清理按钮应当执行删除逻辑并重置 UI', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    await ui.updateRecordingStatus('Server A', 'Local');
~~~~~
~~~~~javascript.new
  it('点击清理按钮应当执行删除逻辑并重置 UI', async () => {
    const adapter = createMockAdapter(mockAppState);
    activeUI = await createUI(adapter, mockCallbacks);
    await activeUI.updateRecordingStatus('Server A', 'Local');
~~~~~
~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
  it('当没有重复项时，点击扫描应当重置按钮', async () => {
    // 覆盖 mock 返回空数组
    mockCallbacks.scanAllDuplicatesAsync.mockResolvedValueOnce([]);

    const cleanState = {
      S1: { L1: [{ content: 'unique', time: new Date().toISOString(), type: 'say' }] },
    };
    const adapter = createMockAdapter(cleanState);
    await createUI(adapter, mockCallbacks);

    const toggleBtn = document.getElementById('log-archive-ui-toggle-button');
~~~~~
~~~~~javascript.new
  it('当没有重复项时，点击扫描应当重置按钮', async () => {
    // 覆盖 mock 返回空数组
    mockCallbacks.scanAllDuplicatesAsync.mockResolvedValueOnce([]);

    const cleanState = {
      S1: { L1: [{ content: 'unique', time: new Date().toISOString(), type: 'say' }] },
    };
    const adapter = createMockAdapter(cleanState);
    activeUI = await createUI(adapter, mockCallbacks);

    const toggleBtn = document.getElementById('log-archive-ui-toggle-button');
~~~~~

### 下一步建议

1.  **运行测试**：执行 `npm test` 验证 `ui.clean_duplicates.test.js` 是否不再超时。
2.  **集成测试修复**：注意到 `ui.integration.test.js` 也存在类似的创建 UI 后未销毁的问题，如果该文件之后也出现超时，应采用同样的 `destroy` 模式进行修复。
3.  **检查 `main.js` 调用**：确认 `main.js` 中对 `createUI` 的调用不需要显式销毁（通常在单页应用生命周期中，只要不频繁重启引擎，保持单一实例是合理的）。
