好的。我们已经完成了 UI 回归测试网的构建，并修复了由测试发现的渲染逻辑缺陷。现在的代码库已经具备了进行大规模异步重构的安全基础。

我将生成一个 `[COMMIT]` 计划，将这些变更作为逻辑单元提交。

## [COMMIT] refactor(ui): establish integration tests and fix rendering bugs

### 用户需求

用户要求将当前的修改提交到 Git 仓库。

### 评论

这是一个非常关键的提交。通过引入 `testing-library` 建立的 UI 集成测试网，我们不仅解决了现有的初始化渲染 Bug，还为接下来的“异步化”这一高风险重构提供了必要的“安全气囊”。目前所有 31 项测试均已通过，状态稳定。

### 目标

1. 将新增的测试文件、修改的 UI 逻辑文件以及更新的依赖配置添加到 Git 暂存区。
2. 创建一个结构清晰、语义明确的提交记录。

### 基本原理

遵循 [COMMIT] 计划规范，我们将执行 `git_add` 和 `git_commit` 操作。本次提交涵盖了测试环境的搭建（Testing Library）、UI 核心 Bug 的修复（渲染时序与 A11y 关联）以及测试套件的精简优化。

### 标签

#intent/refine #flow/ready #priority/medium #comp/ui #comp/tests #scope/dx #scope/ux #ai/delegate #task/domain/ui #task/object/regression-tests #task/action/integration #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交变更

我们将把所有涉及 UI 修复、测试套件更新及依赖变动的文件提交。

~~~~~act
git_add
package.json
package-lock.json
src/ui/templates.js
src/ui/renderer.js
tests/ui.integration.test.js
tests/ui_state.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
refactor(ui): establish integration tests and fix rendering bugs

This commit builds a safety net for the upcoming asynchronous storage refactor by introducing UI integration tests using @testing-library/dom.

Key changes:
- fix(ui): corrected the rendering sequence in renderer.js where channel data was accessed before the selector was populated.
- fix(ui): added 'for' attributes to labels in templates.js for better accessibility and testability.
- test(ui): added comprehensive smoke tests in tests/ui.integration.test.js covering initial load, view switching, and pagination.
- test(ui): slimmed down tests/ui_state.test.js to focus on state machine logic, removing redundancy with integration tests.
- chore: added @testing-library/dom as a dev dependency.

All 31 tests are currently passing, providing a stable baseline for the storage engine upgrade.
~~~~~

### 下一步建议

- **开始异步化重构**：现在你可以放心开始第一步——将 `storage.js` 的同步接口重构为基于 `Promise` 的异步接口。
- **监控测试**：在重构过程中，持续运行 `npm test`，确保 `ui.integration.test.js` 始终保持通过状态。任何导致界面卡死或数据未加载的重构错误都会被该测试套件立即捕获。
