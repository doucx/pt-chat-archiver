你的反馈非常关键。通过分析实际的 DOM 结构，我发现之前的测试用例对 PonyTown 的渲染机制理解有误。

特别是关于 **Whisper (私聊)**，"To " 文本实际上是在 `.chat-line-name` 之前的文本节点中，而不是在 `.chat-line-message` 内部。此外，关于 `content` 包含名称和图标的行为，既然这是你的设计初衷，我将修正测试用例的断言以匹配这一预期。

最后，针对时区导致的统计测试失败，我将改进测试逻辑以使其在任何时区环境下都能通过。

## [WIP] fix(testing): 修正测试断言以匹配实际 DOM 结构和设计预期

### 错误分析

1.  **`calculateHourlyActivity` 失败**:
    *   **原因**: `new Date('...Z').getHours()` 会根据运行环境的时区返回不同的小时数。在 UTC+8 环境下，10:00Z 会变成 18:00。
    *   **修复**: 在测试中动态获取 mock 日期的小时数进行断言，而不是硬编码 `10`。

2.  **`Parser` 普通发言解析失败**:
    *   **原因**: 实际代码中 `content` 的提取逻辑确实包含了名称节点，而测试断言期望的是纯消息内容。
    *   **修复**: 更新断言，使其包含预期的名称前缀。

3.  **`Parser` 私聊方向识别失败**:
    *   **原因**: 测试中的 Mock DOM 结构不正确。在 PonyTown 中，"To " 是紧跟在 `.chat-line-lead` 之后、`.chat-line-name` 之前的文本。
    *   **修复**: 构造与真实环境完全一致的 Mock DOM。

### 用户需求
修复测试套件中的错误断言，确保测试能够真实反映代码在实际生产环境中的表现。

### 评论
单元测试必须服务于真实需求。既然你确认 `content` 包含名称是故意的，那么测试就应该验证这一“特性”是否稳定，而不是试图去“修正”它。

### 目标
1.  修正 `tests/analysis.test.js` 以兼容不同时区的测试运行。
2.  修正 `tests/parser.test.js` 中的 Mock DOM 结构和断言字符串。

### 基本原理
通过调整测试代码，使其对环境（时区）和业务逻辑（故意保留的名称）具有更强的适应性。对于 DOM 解析，我们将使用更接近实际 HTML 的构造方式。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #scope/dx #ai/instruct #task/domain/testing #task/object/test-fixes #task/action/refinement #task/state/continue

---

### Script

#### Acts 1: 修正统计逻辑测试

我们将不再硬编码小时数，而是从日期对象中动态提取，以应对不同开发机器的时区设置。

~~~~~act
patch_file
tests/analysis.test.js
~~~~~
~~~~~javascript.old
  it('calculateHourlyActivity 应当正确识别高峰小时', () => {
    const { data } = calculateHourlyActivity(mockMessages);
    // 10点有2条，11点有2条（包含系统消息，因为此函数目前不检查 sender）
    expect(data.find(d => d.hour === 10).count).toBe(2);
  });
~~~~~
~~~~~javascript.new
  it('calculateHourlyActivity 应当正确识别高峰小时', () => {
    const { data } = calculateHourlyActivity(mockMessages);
    const expectedHour = new Date(mockMessages[0].time).getHours();
    expect(data.find(d => d.hour === expectedHour).count).toBe(2);
  });
~~~~~

#### Acts 2: 修正解析引擎测试

根据你提供的真实 DOM 结构，我们调整 Mock HTML 和相应的断言。

~~~~~act
patch_file
tests/parser.test.js
~~~~~
~~~~~javascript.old
  it('应当能从 DOM 元素中解析普通发言', () => {
    const el = document.createElement('div');
    el.className = 'chat-line';
    el.innerHTML = `
      <span class="chat-line-timestamp">10:00</span>
      <span class="chat-line-name">[SenderName]</span>
      <span class="chat-line-message">Hello World</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('say');
    expect(data.sender).toBe('SenderName');
    expect(data.content).toBe('Hello World');
  });

  it('应当能识别发出的私聊 (To ...)', () => {
    const el = document.createElement('div');
    el.className = 'chat-line chat-line-whisper';
    el.innerHTML = `
      <span class="chat-line-name">[Target]</span>
      <span class="chat-line-message">To Target: private message</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('whisper');
    expect(data.sender).toBe('Me');
    expect(data.receiver).toBe('Target');
  });
~~~~~
~~~~~javascript.new
  it('应当能从 DOM 元素中解析普通发言', () => {
    const el = document.createElement('div');
    el.className = 'chat-line';
    el.innerHTML = `
      <span class="chat-line-timestamp">10:00</span>
      <span class="chat-line-name">[SenderName]</span>
      <span class="chat-line-message">Hello World</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('say');
    expect(data.sender).toBe('SenderName');
    // 确认 content 包含名称是符合预期的设计
    expect(data.content).toBe('[SenderName] Hello World');
  });

  it('应当能识别发出的私聊 (To ...)', () => {
    const el = document.createElement('div');
    // 模拟真实的真实 DOM：To 文本在 name 之前
    el.className = 'chat-line chat-line-whisper';
    el.innerHTML = `
      <span class="chat-line-timestamp">03:03</span>
      To <span class="chat-line-name">[Target]</span>
      <span class="chat-line-message">晚好</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('whisper');
    expect(data.sender).toBe('Me');
    expect(data.receiver).toBe('Target');
    expect(data.content).toBe('To [Target] 晚好');
  });
~~~~~

### 下一步建议

1.  **重新运行测试**: 执行 `npm test`。现在测试应当能正确处理你提供的真实 DOM 结构并全量通过。
2.  **验证图标解析**: 既然你提供了一个包含图标 (`img.pixelart`) 的例子，建议再添加一个专门针对图标 `alt` 和 `aria-label` 提取的测试用例，确保复杂的名称不会破坏解析。
3.  **边界情况测试**: 考虑测试“系统提示”（不带名称的消息）是否会被解析器正确归类。
