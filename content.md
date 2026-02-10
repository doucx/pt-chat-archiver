我将修复 `src/parser.js` 中的 lint 错误。通过使用可选链（Optional Chaining），我们可以简化对 DOM 元素的判空逻辑，并符合 Biome 的代码规范。

## [WIP] fix(parser): 使用可选链修复 lint 错误

### 错误分析
Biome 报告了一个 `lint/complexity/useOptionalChain` 错误。
在 `src/parser.js` 的 `extractServerFromDOM` 函数中，代码使用了传统的 `if (serverSpan && serverSpan.textContent.trim())` 模式。这种模式在现代 JavaScript 中被认为过于冗长。Biome 建议使用可选链 (`?.`) 来合并对象存在性检查和属性访问。虽然 Biome 自动修复时将其标记为“不安全”，但在该上下文中（`textContent` 在 DOM 节点上总是字符串），使用可选链是完全安全且符合预期的。

### 用户需求
修复 `npm run check` 报告的 `useOptionalChain` 错误。

### 评论
这是一个微小的重构，旨在提高代码的现代化程度并保持 lint 检查通过。

### 目标
1. 修改 `src/parser.js` 中的 `extractServerFromDOM` 函数。
2. 将传统的 null 检查替换为可选链形式。

### 基本原理
可选链 `?.` 在遇到 null 或 undefined 时会立即停止评估并返回 undefined。通过 `serverSpan?.textContent?.trim()`，我们可以在一行内安全地检查 `serverSpan` 是否存在、其 `textContent` 是否存在以及进行去空格处理，逻辑上与原有的 `&&` 检查完全等价，但语法更简洁。

### 标签
#intent/fix #flow/ready #priority/low 
#comp/docs #concept/parser #scope/dx 
#ai/instruct 
#task/domain/tooling #task/object/lint-fix #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 在 `src/parser.js` 中应用可选链修复

我们将更新 `extractServerFromDOM` 函数，使用可选链来处理 `serverSpan` 的检查。

~~~~~act
patch_file
src/parser.js
~~~~~
~~~~~javascript.old
  // 寻找按钮内的 span 元素，它通常包含服务器名称
  const serverSpan = playButton.querySelector('span');
  if (serverSpan && serverSpan.textContent.trim()) {
    return serverSpan.textContent.trim();
  }
~~~~~
~~~~~javascript.new
  // 寻找按钮内的 span 元素，它通常包含服务器名称
  const serverSpan = playButton.querySelector('span');
  if (serverSpan?.textContent?.trim()) {
    return serverSpan.textContent.trim();
  }
~~~~~

### 下一步建议
- **运行检查**: 请执行 `npm run check` 验证该错误是否已消失。
- **提交更改**: 验证通过后，可以生成一个 `[COMMIT]` 计划来提交此修复。
