你的分析非常到位。Pony Town 近期的 UI 更新将频道标签页分拆到了不同的子容器中（固定频道和滚动频道），导致原有的探测逻辑只覆盖了局部。同时，为了更清晰地反馈当前的录制状态，将频道名称集成到状态栏中是一个非常实用的改进。

我将通过以下计划来修复探测鲁棒性并升级状态显示。

## [WIP] fix: 增强频道探测鲁棒性并优化录制状态显示

### 用户需求

1.  **修复 Bug**: 解决由于 Pony Town UI 结构变动导致的频道识别不准、消息错位记录的问题。
2.  **UI 增强**: 在录制状态栏中同时显示当前的服务器和活跃频道，格式为 `服务器::频道`。

### 评论

这是一个典型的由于上游 UI 变动导致的兼容性问题。通过将探测点上移至 `.chat-log-tabs-container`，我们可以捕获到所有类型的标签页（无论是固定的 Local/Party 还是滚动的私聊标签）。在状态栏增加频道显示则进一步提升了用户对脚本运行状态的掌控感。

### 目标

1.  更新 `parser.js` 中的 `locateChatElements`，使其指向更高层级的标签容器。
2.  更新 `ui/state.js`，增加 `recordedChannel` 状态用于追踪当前录制的目标。
3.  修改 `ui/renderer.js`，将状态栏显示逻辑改为 `服务器::频道`。
4.  在 `main.js` 中建立频道切换与 UI 更新的联动。

### 基本原理

通过 MutationObserver 监听整个标签容器，我们可以确保在任何频道（包括 Pinned 频道）切换时都能收到通知。UI 层将维护一个独立的“当前录制位置”状态，并在每次刷新视图时将其与服务器名称拼接显示。

### 标签

#intent/fix #flow/ready #priority/high #comp/cli #comp/engine #concept/parser #concept/ui #scope/ux #ai/refine #task/domain/parser #task/object/channel-detection #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 增强解析器探测能力

我们将探测范围从具体的 `.chat-log-tabs` 提升到包装容器 `.chat-log-tabs-container`。

~~~~~act
patch_file
src/parser.js
~~~~~
~~~~~javascript.old
/** 定位页面上的关键聊天元素。*/
export function locateChatElements() {
  return {
    tabs: document.querySelector('.chat-log-tabs'),
    chatLog: document.querySelector('.chat-log-scroll-inner'),
~~~~~
~~~~~javascript.new
/** 定位页面上的关键聊天元素。*/
export function locateChatElements() {
  return {
    tabs: document.querySelector('.chat-log-tabs-container') || document.querySelector('.chat-log-tabs'),
    chatLog: document.querySelector('.chat-log-scroll-inner'),
~~~~~

#### Acts 2: 扩展 UI 状态以追踪录制频道

在 `uiState` 中增加 `recordedChannel` 字段。

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
    selectedChannel: 'Local', // 默认为 Local 频道
  };
~~~~~
~~~~~javascript.new
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    recordedChannel: null, // 当前正在录制的频道
    viewingServer: null, // 当前正在查看的存档服务器
    selectedChannel: 'Local', // 默认为 Local 频道
  };
~~~~~
~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    setActiveServer: (serverName) => {
      state.activeServer = serverName;
      // 如果开启了自动跟随，或者这是第一次检测到服务器，则更新查看视图
      if (state.autoFollowServer || !state.viewingServer) {
        state.viewingServer = serverName;
      }
    },
~~~~~
~~~~~javascript.new
    setRecordingStatus: (serverName, channelName) => {
      state.activeServer = serverName;
      state.recordedChannel = channelName;
      // 如果开启了自动跟随，或者这是第一次检测到服务器，则更新查看视图
      if (state.autoFollowServer || !state.viewingServer) {
        state.viewingServer = serverName;
      }
    },
~~~~~

#### Acts 3: 修改 Renderer 状态栏显示逻辑

更新渲染逻辑，将 `activeServer` 和 `recordedChannel` 组合显示。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
  const render = (context, callbacks) => {
    const { viewMode, currentPage, totalPages, viewingServer, activeServer, isLockedToBottom } =
      uiState.getState();
    const { serverList, channelList, channelCounts, messages, selectedChannel } = context;
~~~~~
~~~~~javascript.new
  const render = (context, callbacks) => {
    const {
      viewMode,
      currentPage,
      totalPages,
      viewingServer,
      activeServer,
      recordedChannel,
      isLockedToBottom,
    } = uiState.getState();
    const { serverList, channelList, channelCounts, messages, selectedChannel } = context;
~~~~~
~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
      if (!activeServer) {
        dom.serverStatus.textContent = '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (!isReadOnly) {
        dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}`;
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else {
        dom.serverStatus.textContent = `📖 浏览存档: ${viewingServer}`;
        dom.serverStatus.style.color = 'var(--color-text-dim)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = false;
      }
~~~~~
~~~~~javascript.new
      if (!activeServer) {
        dom.serverStatus.textContent = '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (!isReadOnly) {
        const channelSuffix = recordedChannel ? `::${recordedChannel}` : '';
        dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}${channelSuffix}`;
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else {
        dom.serverStatus.textContent = `📖 浏览存档: ${viewingServer}`;
        dom.serverStatus.style.color = 'var(--color-text-dim)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = false;
      }
~~~~~

#### Acts 4: 更新 UI 控制接口

修改 `updateServerDisplay` 以支持频道参数，并重命名为更准确的 `updateRecordingStatus`。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    isUIPaused: () => uiState.getState().isUIPaused,
    getInitDebounceMs: () => uiState.getState().initDebounceMs,
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      refreshView();
    },
  };
}
~~~~~
~~~~~javascript.new
    isUIPaused: () => uiState.getState().isUIPaused,
    getInitDebounceMs: () => uiState.getState().initDebounceMs,
    updateRecordingStatus: (serverName, channelName) => {
      uiState.setRecordingStatus(serverName, channelName);
      refreshView();
    },
  };
}
~~~~~

#### Acts 5: 联动 Main.js 逻辑

在 `main.js` 的关键节点触发 UI 更新。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    const handleTabChange = () => {
      const newActiveTab = findActiveTabByClass(tabsContainer.innerHTML);
      if (newActiveTab && newActiveTab !== currentActiveChannel) {
        currentActiveChannel = newActiveTab;
        isSwitchingTabs = true;
        setTimeout(async () => {
          await scanAndMergeHistory();
          isSwitchingTabs = false;
        }, 250);
      }
    };
~~~~~
~~~~~javascript.new
    const handleTabChange = () => {
      const newActiveTab = findActiveTabByClass(tabsContainer.innerHTML);
      if (newActiveTab && newActiveTab !== currentActiveChannel) {
        currentActiveChannel = newActiveTab;
        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
        }
        isSwitchingTabs = true;
        setTimeout(async () => {
          await scanAndMergeHistory();
          isSwitchingTabs = false;
        }, 250);
      }
    };
~~~~~
~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    const updateServer = async () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }
~~~~~
~~~~~javascript.new
    const updateServer = async () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
        }
~~~~~

### 下一步建议

- **功能验证**: 进入游戏，尝试在 Local 和 Party 频道之间切换，观察状态栏是否能实时更新为 `服务器::Local` 或 `服务器::Party`。
- **私聊验证**: 开启一个新的私聊（Whisper）标签页，验证解析器是否能正确识别这个处于“非固定容器”中的新活跃频道。
- **代码清理**: 确认 UI 渲染的 `recordedChannel` 在没有频道信息时（如刚进游戏还未检测到标签）能优雅降级。
