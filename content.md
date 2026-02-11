这是一个典型的由于 JavaScript 模板字符串中的**换行符和缩进空格**被解析器当作普通文本节点处理而导致的测试失败。

在真实的 PonyTown DOM 中，`[`、内容和 `]` 之间是没有多余空格的。我在测试用例中为了美观使用了多行 HTML，导致 `customTextContent` 提取到了缩进产生的空白符。我将修正测试用例，使用单行 HTML 字符串来精确模拟真实环境。

## [WIP] fix(tests): 修正测试用例中的 HTML 缩进导致的空白符错误

### 用户需求
修复 `tests/parser.test.js` 中由于 HTML 模拟代码缩进导致的消息内容解析断言失败。

### 评论
在进行 DOM 解析测试时，HTML 字符串的格式必须高度严谨。多行模板字符串中的每一个换行和空格都会被 `customTextContent` 捕获，并最终被 `replace(/\s+/g, ' ')` 转化为单个空格。

### 目标
1.  将 `tests/parser.test.js` 中的测试 HTML 修改为单行形式，消除非预期的空格。
2.  确保 `data.content` 的断言与真实解析逻辑完全匹配。

### 基本原理
通过消除 Mock HTML 中的换行和缩进，我们确保传递给解析器的数据与游戏环境产生的 DOM 字节级一致，从而使断言回归绿色。

### 标签
#intent/fix #flow/ready #priority/medium #comp/tests #scope/dx #ai/instruct #task/domain/testing #task/object/test-whitespace #task/action/refinement #task/state/continue

---

### Script

#### Acts 1: 修正测试用例中的 HTML 字符串格式

我们将受影响的测试用例修改为单行 HTML，以保证解析出的字符串不含多余空格。

~~~~~act
patch_file
tests/parser.test.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
  it('应当能解析包含 Emoji 图片的复杂名称', () => {
    const el = document.createElement('div');
    el.className = 'chat-line';
    // 使用单行字符串，避免 HTML 缩进引入多余空格
    el.innerHTML = '<span class="chat-line-name">[<span class="chat-line-name-content">UserA <img class="pixelart" alt="🌌"></span>]</span> <span class="chat-line-message">编程中</span>';
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.sender).toBe('UserA 🌌');
    expect(data.content).toBe('[UserA 🌌] 编程中');
  });

  it('应当能解析系统重连等元消息', () => {
~~~~~

### 下一步建议

1.  **重新运行测试**: 执行 `npm test`。现在所有解析器的测试用例应该都能顺利通过了。
2.  **COMMIT 准备**: 随着测试套件的完善，我们现在的代码基础已经非常稳固。你可以考虑将这些改动作为一个完整的 `feat(testing)` 提交到 Git。
3.  **UI 渲染测试**: 如果你还有余力，可以考虑为 `src/ui/renderer.js` 添加测试，验证 `formatMessageForDisplay` 函数是否能正确处理包含 Emoji 的消息对象。
