你的错误分析完全正确，直击要害。

问题确实出在 `src/ui/dom.js` 的 `getDOMElements` 函数中模块级的 `domElements` 缓存变量。在 `vitest` 的 `jsdom` 环境下，每个测试用例 (`it`) 都会重置 DOM (`document.body.innerHTML = ''`)，但 `domElements` 变量作为模块级单例，并不会被重置。

因此，从第二个测试用例开始，`initDOM` 创建了新的 DOM 节点，但后续的 `getDOMElements` 调用仍然返回了第一次测试时缓存的、已经被分离（detached）的旧节点引用。这导致 `renderer` 的所有更新都作用在了这些无效节点上，而 `testing-library` 的 `screen` 查询的是新创建的、实际可见的节点，两者之间出现了致命的脱节，导致断言失败。

解决方案正如你所指出的，是在每次 DOM 初始化时，强制重置这个缓存。

我将生成一个计划来执行这个修复。

## [WIP] fix(testing): 重置 DOM 元素缓存以修复集成测试

### 错误分析

集成测试 (`tests/ui.integration.test.js`) 失败的根本原因是 `src/ui/dom.js` 中的一个缓存机制与测试环境的生命周期产生了冲突：

1.  **单例缓存**: `getDOMElements` 函数将其首次查询到的 DOM 元素引用缓存到一个模块级的 `domElements` 变量中，后续调用直接返回此缓存。
2.  **测试生命周期**: 在测试套件中，每个测试用例 (`it` block) 都会通过 `renderUI` 函数清空并重新构建整个 UI 的 DOM 结构。
3.  **缓存未失效**: 当第二个测试用例执行 `initDOM` 创建新节点后，`getDOMElements` 仍然返回第一个测试用例中缓存的、现已从文档中分离的旧节点引用。
4.  **状态不一致**: 结果是，UI 渲染逻辑 (`renderer`) 更新的是这些陈旧的、不可见的节点，而测试断言 (`screen.getBy...`) 查询的是新创建的、可见的节点。两者操作的不是同一个 DOM 对象，导致所有关于视图更新的测试都失败了。

### 用户需求

修复 `tests/ui.integration.test.js` 中所有失败的测试用例，确保 UI 测试的稳定性和隔离性。

### 评论

这是一个在与测试环境交互时常见的模块化编程陷阱。在应用运行时，模块级缓存是一种有效的性能优化；但在测试中，它破坏了测试用例之间的状态隔离。修复这个问题对于保证测试套件的可靠性至关重要。

### 目标

修改 `src/ui/dom.js`，确保每次 UI 的 DOM 结构被重新创建时，元素引用缓存都会被同步失效并重新查询。

### 基本原理

最直接且逻辑上最正确的解决方案是在 `initDOM` 函数的入口处重置 `domElements` 缓存。`initDOM` 是创建所有 UI DOM 节点的起点，因此它是使缓存失效的最理想位置。通过在函数开头将 `domElements` 设置为 `null`，可以强制下一次 `getDOMElements` 调用重新执行 `document.getElementById` 查询，从而获取到当前最新的 DOM 节点引用。

### 标签

#intent/fix #flow/ready #priority/high #comp/tests #scope/dx #ai/instruct #task/domain/testing #task/object/integration-tests #task/action/bug-fix #task/state/begin

---

### Script

#### Acts 1: 在 DOM 初始化时重置缓存

我们将修改 `src/ui/dom.js` 文件，在 `initDOM` 函数的开始处添加一行代码，用于清空 `domElements` 缓存。

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript
export function initDOM(version) {
  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
~~~~~
~~~~~javascript
export function initDOM(version) {
  // Reset cache on re-initialization, crucial for testing environments.
  domElements = null;

  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
~~~~~

### 下一步建议

我们已经应用了修复逻辑。现在，请重新运行测试命令，以验证问题是否已解决：

```bash
npm run test:coverage
```

如果所有测试都通过了，我将为你生成一个 `[COMMIT]` 计划，将这个修复作为一个完整的单元提交到版本控制中。
