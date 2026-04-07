分析得非常准确！确实存在一个 Bug 导致初始状态没有被正确传递给 UI。

## [WIP] 修复 BUG 并细化提示

### 错误分析

**Bug 原因**：
在 `src/main.js` 的 `main` 函数中，我们在初始化 UI (`createUI`) 之前，就立即调用了一次 `updateServer()`。
```javascript
// 1. 先监听并执行了 updateServer
serverObserver = new MutationObserver(updateServer);
serverObserver.observe(document.body, { childList: true, subtree: true });
await updateServer(); // <-- 此时服务器已被解析 (detectedServerName 赋值)

// 2. 然后才初始化 UI
uiControls = await createUI(dataAdapter, { ... });
```
在 `updateServer` 内部，只有当 `uiControls` 存在时才会调用 `updateRecordingStatus` 同步状态。由于第一次执行时 UI 还没创建好，这个状态变更就被“吞掉”了。只有当玩家手动刷新页面导致 DOM 再次变化触发 MutationObserver 时，才会正常显示。

### 用户需求
1. 修复由于初始化时序导致的“检测到服务器但 UI 未更新”的 Bug。
2. 细化 UI 状态提示：当提取到服务器名字但还没获取到聊天频道时（即在加载界面），显示 `"✅ 已检测到: [服务器名]"`；当正式进入游戏后（提取到频道名），显示 `"✅ 正在记录: [服务器名]::[频道名]"`。

### 评论
区分“检测到”和“正在记录”是一个很好的用户体验优化。这能让玩家明确知道脚本已经成功挂载并识别了当前服务器，正蓄势待发。结合修复初始化丢失状态的 Bug，整个启动流程的信息反馈将变得非常顺畅。

### 目标
1. 在 `main.js` 中，UI 实例创建完毕后，立即将现有的 `detectedServerName` 补发给 UI。
2. 在 `renderer.js` 中，根据 `recordedChannel` 的有无，分别渲染“已检测到”和“正在记录”两种文案。

### 基本原理
- **状态同步补救**：在 `uiControls = await createUI(...)` 的下一行，手动执行一次 `uiControls.updateRecordingStatus`，确保早于 UI 创建前被设置的全局变量能够被 UI 接收到。
- **状态细化**：利用 `uiState` 中的 `recordedChannel` 作为判断依据。如果在加载界面，聊天框未出现，`recordedChannel` 必然为空。

### 标签
#intent/fix #intent/tune #flow/ready #priority/high #comp/ui #comp/runtime #scope/ux #ai/instruct

---

### Script

#### Acts 1: 修复 main.js 中的初始化状态丢失问题
在 UI 初始化完成后，立即补发当前检测到的服务器状态。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state), // 仍提供给批量导入等特殊维护操作使用
      mergeMessagesToStorage: async (state) => await storageManager.mergeAllV6(state),
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
      replaceState: async (newState) => {
        // UI 会被通知刷新以自动请求新数据
      },
    });

    await uiControls.checkStorageUsage();

    const uiObserver = new MutationObserver(() => {
~~~~~
~~~~~javascript.new
    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state), // 仍提供给批量导入等特殊维护操作使用
      mergeMessagesToStorage: async (state) => await storageManager.mergeAllV6(state),
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
      replaceState: async (newState) => {
        // UI 会被通知刷新以自动请求新数据
      },
    });

    // 将初始检测到的服务器状态同步给 UI，修复初始加载时状态未更新的 Bug
    if (detectedServerName) {
      uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
    }

    await uiControls.checkStorageUsage();

    const uiObserver = new MutationObserver(() => {
~~~~~

#### Acts 2: 细化 renderer.js 中的状态文案
根据 `recordedChannel` 的有无，区分“加载中（已检测）”和“游戏中（记录中）”两种状态。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    if (dom.serverStatus) {
      if (!activeServer) {
        const lastSrv = uiState.getState().lastServer;
        dom.serverStatus.textContent = lastSrv ? `等待进入游戏... (上一个服务器: ${lastSrv})` : '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (!isReadOnly) {
        const channelSuffix = recordedChannel ? `::${recordedChannel}` : '';
        dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}${channelSuffix}`;
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else {
        dom.serverStatus.textContent = `📖 浏览存档: ${viewingServer}`;
~~~~~
~~~~~javascript.new
    if (dom.serverStatus) {
      if (!activeServer) {
        const lastSrv = uiState.getState().lastServer;
        dom.serverStatus.textContent = lastSrv ? `等待进入游戏... (上一个服务器: ${lastSrv})` : '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (!isReadOnly) {
        if (recordedChannel) {
          dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}::${recordedChannel}`;
        } else {
          dom.serverStatus.textContent = `✅ 已检测到: ${activeServer}`;
        }
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else {
        dom.serverStatus.textContent = `📖 浏览存档: ${viewingServer}`;
~~~~~

### 下一步建议
修改完毕！现在的逻辑将会是：
1. 刚打开网页，没检测到 "Play on..." 按钮时，显示：“等待进入游戏... (上一个服务器: XXX)”
2. 解析到 "Play on..." 按钮时，立刻刷新为：“✅ 已检测到: Safe Chinese”
3. 点击 Play 正式进入游戏并且聊天框出现后，刷新为：“✅ 正在记录: Safe Chinese::Local”

你可以重新刷新页面测试一下这个启动反馈流是否自然。如果没问题，我们可以考虑生成一个提交。
