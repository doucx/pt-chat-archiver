测试失败的主要原因是 UI 重构为**异步渲染管道**后，测试代码没有等待异步操作（`refreshView`）完成就进行了断言。在 `createUI` 返回时，初始渲染可能还在进行中；同理，点击按钮后的视图切换也是异步的。

我将生成一个计划，通过在 `createUI` 中增加对初始渲染的等待，并更新测试用例以使用异步查询来修复这些问题。

## [WIP] fix(ui): 确保初始渲染同步完成并修复测试异步竞争

### 错误分析
1.  **初始渲染未等待**: `createUI` 内部调用了 `refreshView()` 但没有 `await`。由于 `refreshView` 是异步的（涉及 `dataAdapter` 调用），`createUI` 会在 DOM 还没填充数据前就返回，导致测试中获取到的 `channelSelector.value` 为空。
2.  **测试竞争条件**: `tests/ui.integration.test.js` 中的 `fireEvent.click` 触发了异步的视图切换。测试代码立即执行了 `expect(logView).not.toBeVisible()`，而此时异步渲染函数还没来得及修改 DOM 的 `display` 样式。
3.  **文本匹配问题**: 在 `tests/ui.clean_duplicates.test.js` 中，直接使用 `getByText` 同步获取可能尚未更新的按钮文本，导致找不到元素。

### 用户需求
修复异步重构引入的测试回归，确保 UI 在初始化和交互后的状态断言是可靠的。

### 评论
这是异步化重构后的典型“成长的烦恼”。通过在入口函数中等待首屏渲染，以及在测试中使用 `await waitFor` 或 `findBy` 系列方法，可以优雅地解决此类非确定性问题。

### 目标
1.  修改 `src/ui/index.js`，在返回 API 之前 `await refreshView()`，确保 UI 实例创建后即处于就绪状态。
2.  更新 `tests/ui.clean_duplicates.test.js`，将同步获取改为异步等待。
3.  更新 `tests/ui.integration.test.js`，为所有涉及 DOM 变更的断言增加 `await waitFor`。

### 标签
#intent/fix #flow/ready #priority/high #comp/ui #comp/tests #scope/core #task/domain/testing #task/object/async-timing-fix #task/action/repair #task/state/end #task/status/completed

---

### Script

#### Acts 1: 确保 `createUI` 等待初始渲染

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~old
  // 4. Initial Render
  refreshView();

  // 5. Return the public API
~~~~~
~~~~~new
  // 4. Initial Render
  // 必须等待首屏渲染完成，确保 UI 实例返回时 DOM 已就绪
  await refreshView();

  // 5. Return the public API
~~~~~

#### Acts 2: 修复 `tests/ui.clean_duplicates.test.js` 的异步竞争

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~old
  it('当没有重复项时，点击按钮应当给出提示', async () => {
    // 构造一个没有重复的状态
    const cleanState = { S1: { L1: [{ content: 'unique', time: new Date().toISOString() }] } };
    const adapter = createMockAdapter(cleanState);
    await createUI(adapter, mockCallbacks);

    fireEvent.click(screen.getByTitle('设置'));
    const cleanButton = screen.getByText('清理重复记录');

    fireEvent.click(cleanButton);
~~~~~
~~~~~new
  it('当没有重复项时，点击按钮应当给出提示', async () => {
    // 构造一个没有重复的状态
    const cleanState = { S1: { L1: [{ content: 'unique', time: new Date().toISOString() }] } };
    const adapter = createMockAdapter(cleanState);
    await createUI(adapter, mockCallbacks);

    fireEvent.click(screen.getByTitle('设置'));
    
    // 使用 findByText 异步等待设置视图渲染完成
    const cleanButton = await screen.findByText('清理重复记录');

    fireEvent.click(cleanButton);
~~~~~

#### Acts 3: 修复 `tests/ui.integration.test.js` 的断言时机

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~old
  it('初始加载时应正确渲染数据和默认频道', async () => {
    await renderUI(mockAppState);

    // 验证默认选中的频道是 Local 并且显示了数据
    const channelSelector = screen.getByRole('combobox');
    expect(channelSelector.value).toBe('Local');

    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 1');
  });

  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    await renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');
    const logView = document.getElementById('log-archive-log-view');
    const configView = document.getElementById('log-archive-config-view');

    // 初始状态
    expect(logView).toBeVisible();
    expect(configView).not.toBeVisible();

    // 点击设置 (模拟切换到 config 模式)
    fireEvent.click(settingsButton);
    expect(logView).not.toBeVisible();
    expect(configView).toBeVisible();

    // 再次点击切回
    fireEvent.click(settingsButton);
    expect(logView).toBeVisible();
  });
~~~~~
~~~~~new
  it('初始加载时应正确渲染数据和默认频道', async () => {
    await renderUI(mockAppState);

    // 虽然 renderUI 内部已经 await refreshView，但在复杂的测试环境中
    // 配合 waitFor 是一种更稳健的实践
    await waitFor(() => {
      const channelSelector = screen.getByRole('combobox');
      expect(channelSelector.value).toBe('Local');
    });

    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 1');
  });

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
