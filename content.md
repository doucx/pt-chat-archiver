好的，我们需要通过自动化测试来确保之前的“加载状态保护”逻辑能够有效防止由于 DOM 抖动引起的错误解锁。

我们将向 `tests/ui.integration.test.js` 中添加一个新的测试用例。该用例会模拟点击“末页”按钮后，在数据尚未完全加载（即 `logDisplay` 仍显示 `⏳`）时触发滚动事件，并断言锁定状态不应被改变。

## [WIP] test: 增加加载期间滚动保护的集成测试

### 用户需求
在测试套件中覆盖“修复锁定状态因加载抖动而失效”的逻辑，防止未来回归。

### 评论
由于该 bug 是由 IndexedDB 异步化引入的典型副作用，通过集成测试模拟这种“加载中”的时间切片是非常必要的。这能验证 `events.js` 中的 guard 是否真正起作用。

### 目标
1.  模拟 UI 处于 `⏳` 加载状态。
2.  在加载状态下触发滚动事件，验证锁定标志 (`active` 类) 没有被移除。
3.  验证在正常内容显示后，手动向上滚动能够正常解锁。

### 标签
#intent/tooling #flow/ready #priority/medium #comp/tests #concept/navigation #ai/instruct #task/domain/testing #task/object/scroll-lock-test #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 向集成测试文件中添加滚动保护测试用例

我们将修改 `tests/ui.integration.test.js`，在文件末尾添加一个新的 `it` 块。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
    // 5. 验证内容只显示到第 50 条
    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 50');
    expect(logDisplay.value).not.toContain('Message 51');
  });
});
~~~~~
~~~~~javascript.new
    // 5. 验证内容只显示到第 50 条
    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 50');
    expect(logDisplay.value).not.toContain('Message 51');
  });

  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
    await renderUI(mockAppState);
    const lastBtn = screen.getByText('»');
    const logDisplay = screen.getByRole('textbox');

    // 1. 点击末页进入锁定模式
    fireEvent.click(lastBtn);
    expect(lastBtn).toHaveClass('active');

    // 2. 模拟加载中状态（refreshView 异步流启动）
    // 直接操作 value 模拟 renderer 的中间态
    logDisplay.value = '⏳ 数据加载与处理中...';

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

### 下一步建议

-   **运行测试**: 执行 `npm test tests/ui.integration.test.js` 以验证修改是否生效。
-   **压力测试**: 如果环境支持，可以在 `refreshView` 中引入人工延迟 (`setTimeout`)，然后手动点击 UI 观察在极慢加载下的表现。
-   **覆盖率检查**: 确认 `scanAllDuplicatesAsync` 的分片加载逻辑是否也在其他测试中得到了充分覆盖。
