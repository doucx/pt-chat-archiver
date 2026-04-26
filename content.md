好的，我们已经完成了修复 UI 反应性问题、优化渲染性能以及新增“首次打开跳转到末尾”功能的所有代码工作。现在，我将生成一个 `[COMMIT]` 计划来提交这些更改。

## [COMMIT] fix(ui): 解决 UI 反应性问题并新增首次进入自动跳转功能

### 错误分析

1.  **反应性阻断 (Reactivity Blocking)**: 在 V7 的 UI 逻辑中，`currentMessages` 信号直接接收了 `ViewCache` 中的数组引用。由于实时增量是通过 `push` 注入原数组的，Signals 检测到引用未变（严格相等），导致 Preact 跳过了对 `LogViewer` 的重新渲染，使得界面关闭后再打开时无法看到新消息。
2.  **构建时引用错误**: 在实现跳转逻辑时，误将需要重新赋值的局部快照变量声明为 `const`，导致生产环境混淆器（esbuild）报错。
3.  **渲染性能浪费**: 界面在隐藏状态下仍然通过 `updateUI` 完整触发了复杂的刷新逻辑，造成了不必要的计算开销。

### 用户需求

1.  修复界面重新打开后数据不刷新的问题。
2.  默认情况下，用户第一次进入 UI 时应自动跳转到消息的最末尾。
3.  在设置中提供该跳转行为的开关。

### 评论

这次修改在解决 Bug 的同时，显著提升了 UI 引擎的健壮性和用户体验。通过引入显式的可见性状态管理，我们建立了一个更可预测的渲染管道。

### 目标

1.  提交所有涉及 `uiStore`、`index.jsx`、`ConfigPanel` 和 `App.jsx` 的逻辑变更。
2.  确保 Git 提交记录包含清晰的功能说明和修复细节。

### 基本原理

通过 `git add` 将修改后的文件存入暂存区，并使用符合规范的 Commit Message 进行记录。此次提交标志着 UI 核心渲染逻辑重构的一个阶段性完成。

### 标签

#intent/fix #flow/ready #priority/high #comp/ui #concept/state #scope/ux #ai/instruct #task/domain/ui #task/object/ui-reactivity-and-navigation #task/action/commit #task/state/end

---

### Script

#### Acts 1: 提交变更

我们将所有相关的 UI 修改添加到暂存区并创建提交。

~~~~~act
git_add
src/ui/store/uiStore.js
src/ui/index.jsx
src/ui/components/ConfigPanel.jsx
src/ui/App.jsx
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
fix(ui): resolve reactivity issues and add "default to last page" feature

- Fixed a bug where new messages failed to render when reopening the UI due to array reference stability.
- Introduced `isUIVisible` signal to manage UI lifecycle and optimize background rendering.
- Decoupled UI visibility from direct DOM manipulation in `index.jsx` and `App.jsx`.
- Implemented an "initial jump to last page" feature that activates only the first time the UI is opened in a session.
- Added a configuration toggle for the initial jump feature in the settings panel.
- Refactored `refreshView` to use array spreads `[...messages]` for forcing signal updates.
- Corrected variable declarations in `index.jsx` to support dynamic state overrides during initialization.
~~~~~

### 下一步建议

- **性能基准测试**: 建议在拥有超过 50,000 条消息的大型数据库中测试 UI 的打开速度，以验证 `isUIVisible` 带来的优化效果。
- **UI 细节优化**: 下一步可以考虑为“跳转到末尾”增加一个平滑滚动的过渡动画，或者在检测到大量新消息产生时，在关闭按钮附近显示一个红点提示。
