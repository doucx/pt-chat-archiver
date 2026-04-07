非常抱歉引入了这个问题！你的观察非常敏锐。

导致“始终显示等待进入游戏”的根本原因是上次重构引入的一个逻辑短路：如果脚本刚启动时从存储恢复了服务器名字（比如“Safe Haven”），而你在 DOM 中重新提取到的服务器恰巧**还是**“Safe Haven”，代码判断 `新名字 !== 旧名字` 失败，于是它认为没有发生变化，就没有去通知 UI 已经检测到服务器了。

我已经找到了分离 DOM 检测状态与历史回退状态的方法，并且会按照你的要求在 UI 上增加上一个服务器的提示。

## [WIP] fix: 修复同服初始化卡顿 bug 并增强等待状态的 UI 提示

### 错误分析

导致卡顿的具体代码在于 `main.js` 中的 `updateServer` 函数：
```javascript
const server = extractServerFromDOM();
if (server && server !== detectedServerName) { ... }
```
当 `detectedServerName` 被赋予了持久化的旧值时，如果新进游戏的服务器也是同一个，这个 `if` 条件就不会成立。导致 UI 永远无法收到激活信号，从而一直显示“等待进入游戏”。

### 用户需求
1. **修复 Bug**：解决进入与上次相同服务器时 UI 卡在“等待进入游戏”的问题。
2. **UI 增强**：在未进入游戏的等待阶段，除了显示“等待进入游戏...”，还要追加显示“（上一个服务器:<server_name>）”。进入游戏后恢复为“正在记录”。

### 评论
分离 DOM 轮询的比较状态与持久化的回退状态是解决此类竞态的最佳实践。UI 上增加历史服务器的显示不仅填补了信息空白，还能让用户确认脚本的持久化机制正在正常工作。

### 目标
1. 修复 `main.js` 中的 DOM 变更检测逻辑，引入 `currentDOMServer` 专用变量。
2. 在 `ui/state.js` 中新增 `lastServer` 状态字段并初始化读取。
3. 修改 `ui/renderer.js` 的渲染逻辑，在未激活状态下展示 `lastServer` 信息。

### 基本原理
通过分离变量，`main.js` 现在即使碰到与上次持久化相同的服务器名，只要是生命周期内的第一次 DOM 捕获，都会触发更新事件。UI 层则会读取 `IndexedDB/localStorage` 中的 `last_server` 并在 `activeServer` 为空时进行友好展示。

### 标签
#intent/fix #intent/tune #flow/ready #priority/high #comp/engine #comp/ui #scope/ux #ai/brainstorm #task/domain/ui #task/object/server-status #task/action/display-update #task/state/begin

---

### Script

#### Acts 1: 修复启动卡死 Bug

我们需要在 `main.js` 中将回退变量和用于轮询去重的变量分开。

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
~~~~~
~~~~~javascript.new
  /** 脚本主入口函数。*/
  async function main() {
    // 1. 初始化存储层 (并自动触发 V6->V7 迁移)
    // 开启 useIndexedDB = true
    await storageManager.init(true);

    // --- 立即恢复上下文与启动服务器监听 (最高优先级) ---
    let lastPersistedServer = await storageManager.getLastServer();
    detectedServerName = lastPersistedServer; // 作为回退值
    let currentDOMServer = null; // 专门用于避免 DOM 轮询重复触发

    const updateServer = async () => {
      const server = extractServerFromDOM();
      if (server && server !== currentDOMServer) {
        currentDOMServer = server;
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        await storageManager.setLastServer(server); // 持久化缓存
~~~~~

#### Acts 2: 增强 UI State 状态机

在 `ui/state.js` 中添加 `lastServer`，使其能从存储中读取并保持更新。

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    activeServer: null, // 当前物理所在的服务器
    recordedChannel: null, // 当前正在录制的频道
    viewingServer: null, // 当前正在查看的存档服务器
    selectedChannel: 'Local', // 默认为 Local 频道
  };

  // Async load config
  const config = await storageManager.getConfig();
~~~~~
~~~~~javascript.new
    activeServer: null, // 当前物理所在的服务器
    recordedChannel: null, // 当前正在录制的频道
    viewingServer: null, // 当前正在查看的存档服务器
    selectedChannel: 'Local', // 默认为 Local 频道
    lastServer: null, // 上一次持久化的服务器名称
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
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
    setRecordingStatus: (serverName, channelName) => {
      state.activeServer = serverName;
      state.recordedChannel = channelName;
      // 如果开启了自动跟随，或者这是第一次检测到服务器，则更新查看视图
      if (state.autoFollowServer || !state.viewingServer) {
~~~~~
~~~~~javascript.new
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
    setRecordingStatus: (serverName, channelName) => {
      state.activeServer = serverName;
      state.recordedChannel = channelName;
      state.lastServer = serverName; // 同步更新视图中的持久化状态
      // 如果开启了自动跟随，或者这是第一次检测到服务器，则更新查看视图
      if (state.autoFollowServer || !state.viewingServer) {
~~~~~

#### Acts 3: 调整 Renderer 的展示文案

在 `ui/renderer.js` 中使用 `lastServer` 变量来丰富“等待进入游戏”的文案。

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
通过分离变量，我们一劳永逸地解决了轮询卡死的逻辑漏洞。现在，当你在主页面点击 Play 前，UI 会显示类似“等待进入游戏... (上一个服务器: Safe Haven)”；点击 Play 并捕获到同名服务器后，它会立刻变成绿色的“✅ 正在记录: Safe Haven”。

请在浏览器中重新编译和测试，验证这个提示是否如期工作，并且是否解决了“永远等待”的 bug！如果测试没问题，你可以下达创建 Commit 的指令。
