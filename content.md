这个问题确实存在，这是由于在脚本启动流程中，**服务器名捕获**（在 `main()` 顶层运行）和**频道捕获**（在 `activateLogger()` 聊天室激活时运行）之间的异步时序不同步导致的。当服务器第一次被发现时，聊天栏可能还没完全就绪，导致频道名为 `null` 并被推送到 UI。

我将一次性修复这两个问题：
1. **修复卡顿与增加 UI 提示**：引入“上一个服务器”显示。
2. **修复首次进入频道缺失**：确保在记录器激活的瞬间，立即同步最新的服务器名和频道名到 UI。

## [WIP] fix: 修复同服初始化卡顿及首次进入频道显示缺失 bug

### 错误分析

1.  **卡顿 Bug**: `main.js` 中使用同一个变量 `detectedServerName` 既做持久化回退，又做 DOM 轮询去重。如果回退值与新捕获值相同，`if` 条件失败，导致 UI 无法接收到初始的“已连接”信号。
2.  **频道显示缺失**: 在进场瞬间，`updateServer` 优先触发并向 UI 发送了 `recordedChannel: null`。随后虽然 `activateLogger` 获取到了频道名，但没有强制要求 UI 重新同步这个状态。

### 用户需求
1.  **UI 增强**: 在等待界面显示“上一个服务器”。
2.  **逻辑修复**: 确保即便进入与上次相同的服务器，也能正常触发 UI 记录状态。
3.  **显示修复**: 确保第一次进入游戏时，频道名（如 `::Local`）能立刻显示，无需手动切换。

### 评论
这些细节修复极大提升了脚本的“成品感”。通过分离 DOM 状态变量并收紧初始化同步逻辑，我们可以确保 UI 状态始终是业务逻辑的真实映射。

### 目标
1.  在 `main.js` 中分离 `currentDOMServer` 和 `detectedServerName`。
2.  在 `activateLogger` 中增加显式的 UI 同步调用。
3.  在 `ui/state.js` 和 `renderer.js` 中实现“上一个服务器”的文案逻辑。

### 标签
#intent/fix #intent/tune #flow/ready #priority/high #comp/engine #comp/ui #scope/ux #task/domain/ui #task/object/initialization-sync #task/action/robustness-fix #task/state/continue

---

### Script

#### Acts 1: 修复 `main.js` 的状态同步逻辑

我们需要确保 DOM 轮询不会被持久化状态“欺骗”，并且在记录器激活时立即同步所有状态。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /** 脚本主入口函数。*/
  async function main() {
    // 1. 初始化存储层 (并自动触发 V6->V7 迁移)
    // 开启 useIndexedDB = true
    await storageManager.init(true);

    // --- 立即恢复上下文与启动服务器监听 (最高优先级) ---
    detectedServerName = await storageManager.getLastServer();

    const updateServer = async () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        await storageManager.setLastServer(server); // 持久化缓存

        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
        }
~~~~~
~~~~~javascript.new
  /** 脚本主入口函数。*/
  async function main() {
    // 1. 初始化存储层 (并自动触发 V6->V7 迁移)
    // 开启 useIndexedDB = true
    await storageManager.init(true);

    // --- 立即恢复上下文与启动服务器监听 (最高优先级) ---
    let lastPersistedServer = await storageManager.getLastServer();
    detectedServerName = lastPersistedServer; // 初始设为持久化值作为回退
    let currentDOMServer = null; // 专门用于 DOM 轮询去重

    const updateServer = async () => {
      const server = extractServerFromDOM();
      // 核心修复：即使 server 等于 detectedServerName (持久化值)，
      // 只要它不同于 currentDOMServer (本次生命周期未处理过)，就应当触发更新。
      if (server && server !== currentDOMServer) {
        currentDOMServer = server;
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        await storageManager.setLastServer(server); // 持久化缓存

        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
        }
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    currentActiveChannel = findActiveTabByClass(tabsContainer.innerHTML);
    tabObserver = new MutationObserver(handleTabChange);
    tabObserver.observe(tabsContainer, {
~~~~~
~~~~~javascript.new
    currentActiveChannel = findActiveTabByClass(tabsContainer.innerHTML);
    // 核心修复：在激活瞬间，如果 UI 已就绪，立即推送最新的频道名
    if (uiControls) {
      uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
    }
    tabObserver = new MutationObserver(handleTabChange);
    tabObserver.observe(tabsContainer, {
~~~~~

#### Acts 2: 增强 UI State 记录持久化服务器

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    recordedChannel: null, // 当前正在录制的频道
    viewingServer: null, // 当前正在查看的存档服务器
    selectedChannel: 'Local', // 默认为 Local 频道
  };

  // Async load config
  const config = await storageManager.getConfig();
~~~~~
~~~~~javascript.new
    recordedChannel: null, // 当前正在录制的频道
    viewingServer: null, // 当前正在查看的存档服务器
    selectedChannel: 'Local', // 默认为 Local 频道
    lastServer: null,
  };

  // Async load config
  state.lastServer = await storageManager.getLastServer();
  const config = await storageManager.getConfig();
~~~~~

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    setRecordingStatus: (serverName, channelName) => {
      state.activeServer = serverName;
      state.recordedChannel = channelName;
      // 如果开启了自动跟随，或者这是第一次检测到服务器，则更新查看视图
~~~~~
~~~~~javascript.new
    setRecordingStatus: (serverName, channelName) => {
      state.activeServer = serverName;
      state.recordedChannel = channelName;
      if (serverName) state.lastServer = serverName;
      // 如果开启了自动跟随，或者这是第一次检测到服务器，则更新查看视图
~~~~~

#### Acts 3: 优化 Renderer 的文案显示

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    if (dom.serverStatus) {
      if (!activeServer) {
        dom.serverStatus.textContent = '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (!isReadOnly) {
~~~~~
~~~~~javascript.new
    if (dom.serverStatus) {
      if (!activeServer) {
        const lastSrv = uiState.getState().lastServer;
        dom.serverStatus.textContent = lastSrv ? `等待进入游戏... (上一个服务器: ${lastSrv})` : '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (!isReadOnly) {
~~~~~

### 下一步建议
1. **启动测试**：现在启动后，你应该能立即看到“等待进入游戏... (上一个服务器: Safe Chinese)”。
2. **进场验证**：点击 Play 进入后，文案应立刻变为“✅ 正在记录: Safe Chinese::Local”，无需任何额外操作。
3. **回归检查**：切换频道，确保 `::Party` 等后缀依然能实时更新。

这次重构通过在 `activateLogger` 中增加主动推送，彻底解决了 UI 渲染和逻辑状态之间的步调不一致问题。如果满意，我们可以进行 Commit。
