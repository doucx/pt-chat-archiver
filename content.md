我找到了测试失败的根本原因。

1. **状态修改未能触发重新拉取数据**: 在旧的 Vanilla JS 架构中，UI 变化事件会直接调用 `refreshView()` 来从底层驱动数据拉取。切换到 Preact 架构后，虽然引入了 `@preact/signals`，组件渲染变成了响应式的，但**异步数据获取**部分依然停留在手动调用的模式。这就导致了测试中“修改了 pageSize 配置后，并没有触发数据的重新读取，所以总页码无法及时更新，断言自然失败”。
2. **只读属性报错**: 在 `ui.integration.test.js` 中模拟向下滚动时，给 mock 的 `scrollTop` 属性赋值被拒绝了，因为在 `Object.defineProperty` 中没有将其定义为 `writable: true`。

我们可以利用 `@preact/signals` 提供的 `effect` 和 `untracked` 钩子，为整个应用建立一个稳健且解耦的**自动刷新机制**。只要我们关注的“关键路由信号”（如当前服务器、频道、页码、页面大小）发生变动，就自动安排一次数据的重载。

下面是修复计划的详细执行指令：

## [WIP] fix(ui): 添加响应式的异步数据拉取机制并修复滚动测试模拟

### 错误分析

- **测试1（分页大小变更）**：`ConfigPanel` 在更新 `pageSize` 这个 Signal 时，只会触发依赖了 `pageSize` 的 UI 组件重新渲染，并不会通知 `index.jsx` 内部挂载的异步过程去拉取新一页的数据集合，这导致视图处于脱节状态。
- **测试2（滚动防抖断言）**：Vitest (jsdom) 拦截了直接对 HTMLElement 特殊属性如 `scrollTop` 的写操作，如果在测试环境中使用 `Object.defineProperty` 覆写了该属性但未提供 setter，就会导致在后续代码尝试更新该属性时抛出 `TypeError`。

### 用户需求
系统在分页大小、频道、页面模式等关键设定改变时，必须能立刻响应并自动重新获取渲染所需的底层数据，并能稳定通过全部测试。

### 评论
使用 `effect` 进行宏观状态监听是 Signals 架构中最优雅的方式。通过 `untracked` 将异步数据拉取包裹起来，可以完美切断可能的响应式死循环风险。这也是这次“换头手术”的最后一块关键拼图。

### 目标
1. 在 `index.jsx` 底部注入一个全局的 `effect` 监听器，追踪核心状态改变。
2. 在 `ui.integration.test.js` 中修复对 `scrollTop` 属性的模拟，并补齐 `await waitFor`。

### 基本原理
当用户在界面的任何地方（例如 ConfigPanel，或是 Pagination）修改了 `pageSize.value` 等依赖，全局 `effect` 都会同步察觉。抛弃了首次加载的冗余执行后，我们在非追踪环境 (`untracked`) 下调用完整的 `refreshView` 来拉取最新记录，从而使所有展示在界面的子数据 (`totalPages`, `currentMessages`) 顺滑地联运变化。

### 标签
#intent/fix #flow/ready #priority/high #comp/ui #concept/state #scope/core #ai/brainstorm #task/domain/ui #task/object/state-reactivity #task/action/fix #task/state/begin

---

### Script

#### Acts 1: 修复 UI 数据自动刷新机制

为 `index.jsx` 增加响应式的自动拉取驱动。由于 `dataAdapter` 需要从 IndexedDB 中异步取数据，我们将这个流程与 Signals 的变化进行绑定。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~old
import { render } from 'preact';
import { UI_MESSAGES } from '../constants.js';
~~~~~
~~~~~new
import { effect, untracked } from '@preact/signals';
import { render } from 'preact';
import { UI_MESSAGES } from '../constants.js';
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~old
  // Mount Preact Tree
  render(<App dataAdapter={dataAdapter} appCallbacks={uiCallbacks} />, container);

  // Initial Data Fetch
  await refreshView();

  // Return Engine API
  return {
~~~~~
~~~~~new
  // Mount Preact Tree
  render(<App dataAdapter={dataAdapter} appCallbacks={uiCallbacks} />, container);

  // Initial Data Fetch
  await refreshView();

  let isFirstEffect = true;
  effect(() => {
    // 声明状态依赖，当它们改变时触发自动刷新
    viewingServer.value;
    selectedChannel.value;
    currentPage.value;
    pageSize.value;
    viewMode.value;

    if (isFirstEffect) {
      isFirstEffect = false;
      return;
    }

    untracked(() => {
      refreshView();
    });
  });

  // Return Engine API
  return {
~~~~~

#### Acts 2: 修复滚动及加载测试

修改集成测试，赋予被 Mock 的 DOM 属性可写权限以满足 `useEffect` 中自动滚动触底的安全写机制；同时，在断言 DOM 状态时加入等待器以匹配 Preact 微任务渲染流。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~old
    // 模拟由内容变短引起的滚动事件
    // 在锁定状态下，如果 isAtBottom 为假（此时内容只有一行，自然为假），且没有加载保护，会触发解锁
    fireEvent.scroll(logDisplay);

    // 3. 验证：由于加载保护存在，锁定状态不应被移除
    expect(lastBtn).toHaveClass('active');

    // 4. 模拟加载完成
    logDisplay.value = 'Line 1\nLine 2\nLine 3';
    // 模拟向上滚动：手动 mock DOM 属性
    Object.defineProperty(logDisplay, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(logDisplay, 'scrollTop', { value: 200, configurable: true });
    Object.defineProperty(logDisplay, 'clientHeight', { value: 500, configurable: true });

    fireEvent.scroll(logDisplay);

    // 5. 验证：此时向上滚动可以正常解锁
    expect(lastBtn).not.toHaveClass('active');
  });
});
~~~~~
~~~~~new
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
});
~~~~~

### 下一步建议

重新运行 `npm run test`，验证所有测试是否已经恢复通过。如果均已绿灯通过，我们就可以安全地合并代码，这标志着 `src/ui` 的 Preact 重构已经全部成功！
