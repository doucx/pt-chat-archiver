我们现在开始执行 **阶段二：UI 状态与渲染重构**。

在这一阶段，我们将升级 UI 模块的内部状态机和渲染逻辑，使其能够理解并处理“服务器 -> 频道 -> 消息”的嵌套结构。核心在于引入“当前物理服务器 (activeServer)”和“查看服务器 (viewingServer)”的概念，从而支持用户在录制当前服务器消息的同时，翻阅其他服务器的历史存档。

## [WIP] feat: 实施 v6 升级阶段二 - UI 状态与渲染重构

### 用户需求
重构 UI 层以适配 v6 的分层数据结构。UI 需要能够区分用户当前所在的服务器和正在查看的服务器，并允许用户通过下拉列表切换查看不同服务器的聊天存档（只读模式）。

### 评论
将“正在录制”与“正在查看”这两个关注点在 UI 状态层面解耦，是提升多服务器环境下用户体验的关键。这为后续的“只读历史查看”功能提供了逻辑支持。

### 目标
1.  **扩展 UI 状态**: 在 `state.js` 中增加 `activeServer` 和 `viewingServer` 状态及其设置器。
2.  **重构渲染引擎**: 修改 `renderer.js` 中的 `render` 函数，使其根据 `viewingServer` 从全局状态树中进行数据切片，并动态填充服务器选择器。
3.  **增强交互反馈**: 在 UI 顶部显示服务器状态（正在录制 vs 只读模式）。
4.  **事件绑定**: 在 `events.js` 中监听服务器选择器的变化。
5.  **入口联动**: 确保 `main.js` 的服务器检测信号能正确驱动 UI 状态的更新。

### 基本原理
通过在 `uiState` 中维护 `activeServer` 和 `viewingServer` 两个变量，我们实现了一个简单的状态机。当 `viewingServer === activeServer` 时，用户处于实时监控模式；当两者不等时，UI 自动切换为只读查看模式，同时保护当前录制逻辑不受影响。

### 标签
#intent/refine #flow/ready #priority/high #comp/cli #concept/ui #concept/state #scope/ux #ai/instruct #task/domain/ui #task/object/ui-state-refactor #task/action/v6-adaptation #task/state/continue

---

### Script

#### Acts 1: 扩展 UI 内部状态

我们在 `src/ui/state.js` 中增加服务器相关的状态管理。

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
export function createUIState() {
  const state = {
    currentPage: 1,
    pageSize: 1000,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
  };
~~~~~
~~~~~javascript.new
export function createUIState() {
  const state = {
    currentPage: 1,
    pageSize: 1000,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
  };
~~~~~
~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
    getSelfName: () => storage.getSelfName(),
    setSelfName: (name) => storage.setSelfName(name),
  };
}
~~~~~
~~~~~javascript.new
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
    setActiveServer: (serverName) => {
      state.activeServer = serverName;
      // 如果还没有选择查看哪个服务器，默认跟随当前服务器
      if (!state.viewingServer) {
        state.viewingServer = serverName;
      }
    },
    setViewingServer: (serverName) => {
      state.viewingServer = serverName;
    },
    getSelfName: () => storage.getSelfName(),
    setSelfName: (name) => storage.setSelfName(name),
  };
}
~~~~~

#### Acts 2: 重构渲染逻辑以适配 v6 结构

我们修改 `render` 函数，使其从 `appState[viewingServer]` 中获取数据，并更新服务器选择器和状态标签。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
  // --- Main Render Logic ---
  const render = (appState, callbacks) => {
    const { viewMode, currentPage, pageSize } = uiState.getState();
    const selectedChannel = dom.channelSelector.value;
    const messages = appState[selectedChannel] || [];

    // Update channel selector
    const channels = Object.keys(appState);
    const prevValue = dom.channelSelector.value;
    dom.channelSelector.innerHTML = '';
    if (channels.length === 0) {
      dom.channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${appState[ch].length})`;
        dom.channelSelector.appendChild(opt);
      }
      if (channels.includes(prevValue)) {
        dom.channelSelector.value = prevValue;
      }
    }
~~~~~
~~~~~javascript.new
  // --- Main Render Logic ---
  const render = (appState, callbacks) => {
    const { viewMode, currentPage, pageSize, viewingServer, activeServer } = uiState.getState();

    // 1. 更新服务器选择器 (v6 特有)
    const servers = Object.keys(appState);
    if (dom.serverViewSelector) {
      const prevServer = dom.serverViewSelector.value;
      dom.serverViewSelector.innerHTML = '';
      if (servers.length === 0) {
        dom.serverViewSelector.innerHTML = '<option value="">无存档</option>';
      } else {
        for (const s of servers) {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          dom.serverViewSelector.appendChild(opt);
        }
        dom.serverViewSelector.value = viewingServer || prevServer || (servers[0] || '');
      }
    }

    // 2. 更新服务器状态显示
    if (dom.serverStatus) {
      if (!activeServer) {
        dom.serverStatus.textContent = '等待进入游戏...';
        dom.serverStatus.style.color = '';
      } else if (viewingServer === activeServer) {
        dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}`;
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
      } else {
        dom.serverStatus.textContent = `⚠️ 只读模式: 正在查看 ${viewingServer} 存档`;
        dom.serverStatus.style.color = 'var(--color-warning)';
      }
    }

    // 3. 获取当前查看服务器的数据切片
    const serverData = appState[viewingServer] || {};
    const selectedChannel = dom.channelSelector.value;
    const messages = serverData[selectedChannel] || [];

    // 4. 更新频道选择器
    const channels = Object.keys(serverData);
    const prevChannelValue = dom.channelSelector.value;
    dom.channelSelector.innerHTML = '';
    if (channels.length === 0) {
      dom.channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${serverData[ch].length})`;
        dom.channelSelector.appendChild(opt);
      }
      if (channels.includes(prevChannelValue)) {
        dom.channelSelector.value = prevChannelValue;
      }
    }
~~~~~
~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
  return {
    render,
    updateServerDisplay: (serverName) => {
      if (dom.serverStatus) {
        dom.serverStatus.textContent = serverName ? `服务器: ${serverName}` : '等待进入游戏...';
      }
    },
    checkStorageUsage: () => {
~~~~~
~~~~~javascript.new
  return {
    render,
    checkStorageUsage: () => {
~~~~~

#### Acts 3: 绑定服务器切换事件

我们在 `src/ui/events.js` 中添加对 `serverViewSelector` 的监听。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.channelSelector.addEventListener('change', () => {
    uiState.setPage(1);
    fullRender();
  });

  // --- View switching ---
~~~~~
~~~~~javascript.new
  dom.channelSelector.addEventListener('change', () => {
    uiState.setPage(1);
    fullRender();
  });

  dom.serverViewSelector.addEventListener('change', () => {
    uiState.setViewingServer(dom.serverViewSelector.value);
    uiState.setPage(1);
    fullRender();
  });

  // --- View switching ---
~~~~~

#### Acts 4: 联动主入口函数

修改 `src/ui/index.js`，使 `updateServerDisplay` 成为更新 UI 状态并触发重绘的接口。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        renderer.render(appState, uiCallbacks);
      }
    },
    checkStorageUsage: renderer.checkStorageUsage,
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: renderer.updateServerDisplay,
  };
}
~~~~~
~~~~~javascript.new
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        renderer.render(appState, uiCallbacks);
      }
    },
    checkStorageUsage: renderer.checkStorageUsage,
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      renderer.render(appState, uiCallbacks);
    },
  };
}
~~~~~

### 下一步建议

UI 模块现在已经具备了处理 v6 分层数据的能力。现在的障碍是：`main.js` 仍然在加载和处理 v5 的扁平数据结构。

接下来的关键步骤是 **阶段三：迁移逻辑与主流程编排**。

我们需要：
1.  在 `src/state.js` 中实现核心迁移函数 `migrateV5toV6`。
2.  全面改造 `src/main.js` 的生命周期：
    *   在启动时加载 V6 存储。
    *   当检测到服务器时，如果发现旧的 V5 数据，触发用户交互确认迁移。
    *   将消息录制逻辑重定向到 `inMemoryChatState[detectedServerName]`。

当你准备好进行这最后一步重构时，请告知我。
