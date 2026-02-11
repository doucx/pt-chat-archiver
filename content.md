非常感谢你提供的真实 DOM 采样！这对于确保解析逻辑的鲁棒性至关重要。

通过分析你提供的片段，我确认了以下关键点：
1.  **收到私聊 (Incoming Whisper)**：特征是名称节点后跟随 ` whispers: ` 文本，且 `content` 中不包含 "To "。
2.  **Emoji 名称解析**：名称嵌套在 `.chat-line-name-content` 中，且 Emoji 图片带有 `alt` 属性。
3.  **系统/元消息**：包含 `.chat-line-meta-line` 或 `.chat-line-system` 类的行，通常不显示名称。

我将根据这些发现更新测试套件。

## [WIP] test(parser): 增加收到私聊及复杂 Emoji 名称的解析测试

### 用户需求
扩展 `parser.js` 的测试用例，覆盖收到私聊的情况以及包含 Emoji 的复杂名称解析。

### 评论
使用真实的 DOM 结构作为测试输入能有效发现解析引擎的边界问题。例如，`whispers: ` 关键字的识别以及 `pixelart` 图片 `alt` 属性的提取，都是确保存档可读性的核心。

### 目标
1.  在 `tests/parser.test.js` 中增加“收到私聊”测试。
2.  增加包含 Emoji 图片的“复杂名称”解析测试。
3.  增加“系统消息”的解析测试。
4.  确保所有测试中的用户名均已脱敏（如使用 `UserA`, `UserB`）。

### 基本原理
我们通过构造精简但结构准确的 HTML 字符串来模拟真实的聊天行。解析引擎会克隆这些节点并遍历其子节点（包括处理 `IMG` 标签），从而验证 `customTextContent` 和 `extractUsefulData` 的协作是否正确。

### 标签
#intent/tooling #flow/ready #priority/medium #comp/tests #scope/dx #ai/instruct #task/domain/testing #task/object/parser-coverage #task/action/expansion #task/state/continue

---

### Script

#### Acts 1: 扩展解析器测试用例

我们将更新 `tests/parser.test.js`，加入基于真实采样结构的测试断言。

~~~~~act
patch_file
tests/parser.test.js
~~~~~
~~~~~javascript.old
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

  it('findActiveTabByClass 应当识别活跃标签页', () => {
~~~~~
~~~~~javascript.new
  it('应当能识别发出的私聊 (To ...)', () => {
    const el = document.createElement('div');
    // 模拟真实的真实 DOM：To 文本在 name 之前
    el.className = 'chat-line chat-line-whisper';
    el.innerHTML = `
      <span class="chat-line-timestamp">03:03</span>
      To <span class="chat-line-name">[UserB]</span>
      <span class="chat-line-message">晚好</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('whisper');
    expect(data.sender).toBe('Me');
    expect(data.receiver).toBe('UserB');
    expect(data.content).toBe('To [UserB] 晚好');
  });

  it('应当能识别收到的私聊 (... whispers:)', () => {
    const el = document.createElement('div');
    // 模拟真实的真实 DOM：whispers: 文本在 name 之后
    el.className = 'chat-line chat-line-whisper';
    el.innerHTML = `
      <span class="chat-line-timestamp">03:04</span>
      <span class="chat-line-name">[UserA]</span> whispers:
      <span class="chat-line-message">你好</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('whisper');
    expect(data.sender).toBe('UserA');
    expect(data.receiver).toBe('Me');
    expect(data.content).toBe('[UserA] whispers: 你好');
  });

  it('应当能解析包含 Emoji 图片的复杂名称', () => {
    const el = document.createElement('div');
    el.className = 'chat-line';
    el.innerHTML = `
      <span class="chat-line-name">[<span class="chat-line-name-content">
        UserA <img class="pixelart" alt="🌌">
      </span>]</span>
      <span class="chat-line-message">编程中</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.sender).toBe('UserA 🌌');
    expect(data.content).toBe('[UserA 🌌] 编程中');
  });

  it('应当能解析系统重连等元消息', () => {
    const el = document.createElement('div');
    el.className = 'chat-line chat-line-meta-line';
    el.innerHTML = `
      <span class="chat-line-timestamp">03:01</span>
      <span class="chat-line-message">Rejoined</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('system');
    expect(data.sender).toBe('System');
    expect(data.content).toBe('Rejoined');
  });

  it('findActiveTabByClass 应当识别活跃标签页', () => {
~~~~~

### 下一步建议

1.  **运行测试**: 执行 `npm test`。
2.  **特殊符号测试**: 考虑测试当 Emoji 的 `alt` 包含私有区字符 (PUA) 时，解析器是否能正确回退到 `aria-label`（你在 `parser.js` 中实现了这个逻辑）。
3.  **多服务器逻辑测试**: 随着测试的完善，我们可以增加对 `main.js` 中 `updateServer` 逻辑的模拟测试，验证当 `detectedServerName` 改变时 UI 是否正确响应。
