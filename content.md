## [WIP] fix: Resolve async usageMB bug in renderer

### 错误分析

在之前的重构中，我将 `getStorageUsageInMB` 修改为了异步函数（返回 `Promise`），但在 `src/ui/renderer.js` 的 `render` 函数内部，仍然以同步方式调用它。

```javascript
// src/ui/renderer.js
const usageMB = getStorageUsageInMB(); // 此时 usageMB 是一个 Promise
dom.configStorageInfo.textContent = `... ${usageMB.toFixed(2)} ...`; // 报错：Promise 没有 toFixed 方法
```

由于 `render` 函数被设计为同步执行以确保 UI 响应性能，我们不应该将其变为 `async`。正确的做法是在 `render` 逻辑中发起异步请求，并在其完成后更新相应的 DOM 元素。

### 用户需求
修复 UI 界面在切换到“设置”视图时发生的崩溃错误。

### 评论
这是一个典型的由于同步/异步混合导致的错误。在处理文件 I/O 或数据库操作时，这类问题非常常见。通过将 UI 更新逻辑解耦，我们可以保持界面的流畅性。

### 目标
1.  修复 `src/ui/renderer.js` 中的 `TypeError`。
2.  确保“设置”视图中的存储占用信息能够正确、异步地显示。

### 基本原理
在 `render` 函数检测到 `viewMode === 'config'` 时，发起一个异步任务获取存储占用情况，然后通过回调更新 DOM。为了防止频繁调用导致的性能问题，我们可以在 `checkStorageUsage` 逻辑中复用。

### 标签
#intent/fix #flow/ready #priority/critical #comp/runtime #concept/ui #scope/core #ai/instruct #task/domain/storage #task/object/renderer #task/action/bug-fix #task/state/continue

---

### Script

#### Acts 1: Fix Renderer Logic

我将修改 `src/ui/renderer.js`，移除在 `render` 同步函数中对 `getStorageUsageInMB` 的直接调用，改为在进入设置视图时异步更新该值。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    if (viewMode === 'config') {
      const usageMB = getStorageUsageInMB();
      dom.configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;

      const { lastSavedTime } = uiState.getState();
~~~~~
~~~~~javascript.new
    if (viewMode === 'config') {
      // 异步更新存储信息，不阻塞渲染
      getStorageUsageInMB().then((usageMB) => {
        dom.configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;
      });

      const { lastSavedTime } = uiState.getState();
~~~~~

#### Acts 2: Verify Integration Tests

现在错误应该已经修复，我需要确保 `tests/ui.integration.test.js` 中的 `waitFor` 能够正确等待这些异步 DOM 更新。之前的 `patch` 已经包含了 `waitFor`，所以理论上现在测试应该能通过。

### 下一步建议

1.  **再次运行测试**: 执行 `npm test` 确认所有 29 个测试用例通过且无 Unhandled Errors。
2.  **Step 2 实施**: 开始第二阶段，引入 **ULID** 到 `parser.js`，并重构 `StorageManager` 以支持更灵活的后端切换逻辑，为 IndexedDB 做最后的准备。
