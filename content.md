抱歉，这是我的疏忽。我在 `index.jsx` 中使用了新定义的信号，但忘记在文件顶部的 `import` 列表中添加它，导致了运行时找不到变量的错误。

## [WIP] fix: 补全 index.jsx 中缺失的 isUIVisible 信号导入

### 错误分析

报错信息 `ReferenceError: isUIVisible is not defined` 确认了在 `src/ui/index.jsx` 中，虽然我们编写了使用 `isUIVisible` 的逻辑，但该变量并未从 `uiStore.js` 中成功导入。由于 JavaScript 在执行到引用该变量的代码（如 `refreshView` 顶部的检查）时无法在当前作用域或闭包中找到定义，因此抛出了异常。

### 用户需求

修复脚本运行时的引用错误，使 UI 能够正常启动。

### 评论

这是一个典型的由于重构过程中遗漏导入声明导致的“低级”错误，通常通过静态检查或热更新后的即时反馈可以迅速定位。

### 目标

1.  在 `src/ui/index.jsx` 的导入部分添加 `isUIVisible`。

### 基本原理

从 `./store/uiStore.js` 导出信号并在 `index.jsx` 中导入，建立正确的模块依赖关系。

### 标签

#intent/fix #flow/ready #priority/critical #comp/ui #scope/ux #ai/instruct #task/domain/ui #task/object/reactivity #task/action/fix #task/state/continue

---

### Script

#### Acts 1: 修正导入语句

将 `isUIVisible` 添加到 `src/ui/index.jsx` 从 `uiStore.js` 导入的信号列表中。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
import {
  currentPage,
  initDebounceMs,
  initStore,
  isLockedToBottom,
  isUIPaused,
  loadingMessage,
  pageSize,
~~~~~
~~~~~javascript.new
import {
  currentPage,
  initDebounceMs,
  initStore,
  isLockedToBottom,
  isUIPaused,
  isUIVisible,
  loadingMessage,
  pageSize,
~~~~~

### 下一步建议

- **刷新页面**: 修正导入后，错误应当消失。请再次尝试切换 UI 的开启与关闭状态。
- **验证功能**: 重点验证在 UI 关闭期间产生的消息，是否能在 UI 开启的瞬间通过 `effect` 驱动的 `refreshView` 立即呈现出来。
