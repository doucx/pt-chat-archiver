这是我的失误，在 JavaScript 中使用 `const` 声明的变量是不可重新赋值的。由于 `refreshView` 函数内部捕获的是状态的“快照”，而在执行首次跳转逻辑时，我们需要更新这些快照以确保后续的消息抓取逻辑使用的是跳转后的页码。

## [WIP] fix: 修正 index.jsx 中的变量声明错误以通过生产环境构建

### 错误分析

在 `refreshView` 函数中，`stateCurrentPage` 和 `stateIsLockedToBottom` 被声明为 `const`。然而，在实现“首次打开跳转到末尾”的功能时，代码尝试直接修改这两个变量的值（以便后续的读取操作能立即使用新页码）。这违反了 JavaScript 的常量约束，导致 `esbuild` 在混淆和压缩代码时抛出 `Assignment to constant variable` 错误。

### 用户需求

修复构建错误，确保插件能正常打包发布。

### 评论

这是一个典型的变量作用域与可变性处理不当的问题。在需要根据逻辑动态调整“快照值”的情况下，应使用 `let` 代替 `const`。

### 目标

1.  将 `src/ui/index.jsx` 中 `stateCurrentPage` 和 `stateIsLockedToBottom` 的声明从 `const` 改为 `let`。

### 基本原理

在 JavaScript 作用域内，`let` 允许变量在初始化后被重新赋值，这符合我们在执行“初始化跳转”后需要同步更新局部快照变量的需求。

### 标签

#intent/fix #flow/ready #priority/critical #comp/ui #scope/dx #ai/instruct #task/domain/ui #task/object/build-error #task/action/fix #task/state/continue

---

### Script

#### Acts 1: 修正快照变量声明

将 `src/ui/index.jsx` 中涉及逻辑重算的快照变量由常量改为可变变量。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
    // Capture state snapshots
    const stateViewingServer = viewingServer.value;
    const stateCurrentPage = currentPage.value;
    const statePageSize = pageSize.value;
    const stateViewMode = viewMode.value;
    const stateIsLockedToBottom = isLockedToBottom.value;
    const stateSelectedChannel = selectedChannel.value;
~~~~~
~~~~~javascript.new
    // Capture state snapshots
    const stateViewingServer = viewingServer.value;
    let stateCurrentPage = currentPage.value;
    const statePageSize = pageSize.value;
    const stateViewMode = viewMode.value;
    let stateIsLockedToBottom = isLockedToBottom.value;
    const stateSelectedChannel = selectedChannel.value;
~~~~~

### 下一步建议

- **重新构建**: 请再次运行 `vite build`。由于变量声明已修正， esbuild 应当能顺利完成 AST 解析。
- **运行验证**: 在游戏中开启 UI，验证首次跳转逻辑是否生效，且没有新的运行时错误。
