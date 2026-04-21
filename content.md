你的分析非常准确。

`tests/ui.integration.test.js` 中存在两个问题：
1.  **Lint 错误**: 在同一个 `describe` 块中定义了两个 `beforeEach` 钩子，这违反了 Biome 的 `noDuplicateTestHooks` 规则。
2.  **测试失败**: 在切换到统计分析的测试中，检查 `textbox` 是否包含 "Message 1" 时没有使用 `waitFor`。由于 `refreshView` 是异步的（涉及数据抓取和信号更新），直接检查可能在数据加载完成前就触发了断言，从而导致查看到的是“无记录”提示。

我将合并 `beforeEach` 钩子，并为失败的断言添加异步等待逻辑。

## [WIP] fix(tests): 修复集成测试中的 lint 错误和异步竞争问题

### 错误分析
- **Lint (noDuplicateTestHooks)**: 在 `UI Integration Smoke Tests` 描述块中，第 82 行和第 92 行分别定义了 `beforeEach`。这不仅导致静态检查报错，也使得测试逻辑变得冗余（例如 `vi.clearAllMocks()` 被调用了两次）。
- **AssertionError**: `expect(screen.getByRole('textbox').value).toContain('Message 1')` 失败。在测试环境中，`renderUI` 虽然设置了服务器和频道信号，但 `LogViewer` 的内容渲染依赖于 `refreshView` 的异步完成。如果没有 `waitFor`，测试主循环会在 `messages` 数组还是空的时候就读取 `textarea` 的值，此时 `displayText` 计算结果为 `UI_MESSAGES.NO_RECORDS_IN_CHANNEL` 对应的提示语，而非预期的消息列表。

### 用户需求
修复测试代码中的 lint 警告和运行期失败，确保 CI 环境能够通过。

### 评论
随着系统向异步数据流（IndexedDB + Signals）迁移，集成测试必须更加依赖 `testing-library` 的 `waitFor` 机制，以确保 UI 已经对数据变更做出了反应。

### 目标
1.  合并 `tests/ui.integration.test.js` 中的 `beforeEach` 钩子。
2.  在 `切换到统计分析时应显示加载信息` 测试用例中，为基准数据检查添加 `waitFor`。

### 基本原理
通过合并钩子，我们将初始化逻辑原子化。通过引入 `waitFor`，我们允许虚拟 DOM 在断言执行前完成异步渲染循环。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #scope/dx #ai/delegate #task/domain/testing #task/object/integration-tests #task/action/bug-fix #task/state/begin

---

### Script

#### Acts 1: 优化集成测试的生命周期与异步断言

我们将合并重复的钩子，并修正导致测试失败的竞态条件。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
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
    // 显式重置所有可能被测试修改的全局信号，防止跨测试污染
    viewMode.value = 'log';
    currentPage.value = 1;
    pageSize.value = 1000;
    statsLimit.value = 5000;
    selectedChannel.value = 'Local';
    viewingServer.value = null;
    isLockedToBottom.value = false;
    loadingMessage.value = '';

    mockAppState = {
      'Test Server': {
        Local: Array.from({ length: 250 }, (_, i) => ({
          time: new Date().toISOString(),
          content: `Message ${i + 1}`,
          type: 'say',
        })),
        Party: [{ time: new Date().toISOString(), content: 'Party Message', type: 'party' }],
      },
    };
    vi.clearAllMocks();
  });
~~~~~
~~~~~javascript.new
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    await storageManager.init();
    // 显式重置所有可能被测试修改的全局信号，防止跨测试污染
    viewMode.value = 'log';
    currentPage.value = 1;
    pageSize.value = 1000;
    statsLimit.value = 5000;
    selectedChannel.value = 'Local';
    viewingServer.value = null;
    isLockedToBottom.value = false;
    loadingMessage.value = '';

    mockAppState = {
      'Test Server': {
        Local: Array.from({ length: 250 }, (_, i) => ({
          time: new Date().toISOString(),
          content: `Message ${i + 1}`,
          type: 'say',
        })),
        Party: [{ time: new Date().toISOString(), content: 'Party Message', type: 'party' }],
      },
    };
  });

  afterEach(() => {
    if (activeUI) {
      activeUI.destroy();
      activeUI = null;
    }
  });
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
    activeUI = await renderUI(mockAppState);
    const statsBtn = screen.getByTitle('数据统计');

    // 此时日志视图已加载完毕，进入缓存
    expect(screen.getByRole('textbox').value).toContain('Message 1');
    expect(loadingMessage.value).toBe('');
~~~~~
~~~~~javascript.new
    activeUI = await renderUI(mockAppState);
    const statsBtn = screen.getByTitle('数据统计');

    // 此时日志视图已加载完毕，进入缓存
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toContain('Message 1');
    });
    expect(loadingMessage.value).toBe('');
~~~~~

### 下一步建议

- **运行测试**: 执行 `npm test` 验证此修复是否解决了所有问题。
- **全量 Lint**: 执行 `npm run check` 确保没有其他的规则冲突。
- **重构建议**: 考虑到 `renderUI` 几乎在每个测试中都被使用，且都涉及异步加载，可以考虑在 `renderUI` 内部封装一个通用的 `await waitFor(() => expect(currentMessages.value.length).toBeGreaterThan(0))` 逻辑，从根本上解决测试中的不确定性。
