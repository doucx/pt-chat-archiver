## [WIP] test(ui): 为修改分页大小的集成测试增加异步等待

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #task/domain/testing #task/object/integration-tests #task/action/fix #task/state/begin

---

### Script

#### Acts 1: 补全异步渲染等待

将针对 `textarea` 内容的断言用 `waitFor` 包裹，确保只有在数据读取结束（脱离 loading 状态）后才进行最终判定。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~old
    // 5. 验证内容只显示到第 50 条
    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 50');
    expect(logDisplay.value).not.toContain('Message 51');
  });

  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
~~~~~
~~~~~new
    // 5. 验证内容只显示到第 50 条
    await waitFor(() => {
      const logDisplay = screen.getByRole('textbox');
      expect(logDisplay.value).toContain('Message 50');
      expect(logDisplay.value).not.toContain('Message 51');
    });
  });

  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
~~~~~

### 下一步建议

重新执行 `npm test`，这次应该能稳稳通过了。通过之后，重构的全部闭环就被打通了。
