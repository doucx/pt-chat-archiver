好的，我们已经修复了导致脚本崩溃的关键变量引用问题，并为核心的服务器检测逻辑补充了单元测试。现在我们将这些变更作为一个逻辑单元提交。

## [COMMIT] fix(runtime): 修复 main.js 引用错误并补充服务器检测测试

### 错误分析
在主循环逻辑中，由于重构疏忽：
1. `ChatMonitor` 类未被导入。
2. `updateServer` 尝试访问已移除的全局变量 `currentActiveChannel`。
这导致在检测到服务器切换时抛出 `ReferenceError`，使得主线程崩溃，所有 `MutationObserver` 均失效。

### 用户需求
提交已完成的修复逻辑和测试代码。

### 评论
关键路径的错误修复应及时提交，以保持开发环境的稳定性。

### 目标
1. 将 `src/main.js` 和 `tests/parser.test.js` 的修改添加到暂存区。
2. 创建 Git 提交。

### 基本原理
遵循“修改与提交分离”的原则，在确认代码修复逻辑正确后进行原子化提交。

### 标签
#intent/fix #flow/ready #priority/high #comp/runtime #comp/tests #task/domain/runtime #task/object/main-loop #task/action/bug-fix #task/state/end

---

### Script

#### Acts 1: 提交代码修复与测试补充

~~~~~act
git_add
src/main.js
tests/parser.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
fix(runtime): resolve ReferenceErrors in main loop and add parser tests

- Import missing 'ChatMonitor' in main.js.
- Fix 'ReferenceError' by safely accessing 'currentActiveChannel' through the chatMonitor instance.
- Add unit tests for 'extractServerFromDOM' in parser.test.js to cover various UI button structures and ensure robust server detection.

This fix restores the main execution flow and observer functionality which was previously blocked by unhandled exceptions during server detection.
~~~~~

### 下一步建议
- **执行测试**: 建议立即运行 `npm run test` 确保所有 15 个测试文件（包含新加的服务器检测用例）全部通过。
- **冒烟测试**: 在浏览器中刷新脚本，观察控制台是否还存在 `ChatMonitor is not defined` 的报错。
- **功能巡检**: 验证切换服务器后，UI 的“当前记录”状态是否能正确更新。
