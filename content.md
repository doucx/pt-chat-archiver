我们将引入“自动跟随当前服务器”的功能。该功能在检测到用户切换游戏服务器（如从 Safe 服务器跳转到 18+ 服务器）时，会自动将 UI 视角定位到新服务器的存档，并为此提供一个可配置的开关。

## [WIP] feat: 添加“自动跟随当前服务器”功能及配置项

### 用户需求
1.  **自动跟随**: 当检测到的游戏服务器发生变化时，如果开启了跟随功能，UI 应当自动切换到对应服务器的视图。
2.  **配置化**: 在设置页面添加一个开关，允许用户开启/关闭此功能。
3.  **默认状态**: 该功能默认应为开启（True）。

### 评论
在多服务器环境中，自动跟随是一个非常有用的功能，它保证了用户打开 UI 时看到的总是当前正在产生数据的那个服务器。同时，将其设为可选配置也尊重了那些想要固定在某个存档进行长期分析的用户。

### 目标
1.  更新 `state.js` 以包含 `autoFollowServer` 状态及其持久化逻辑。
2.  修改 `state.js` 中的 `setActiveServer` 逻辑，使其根据配置决定是否更新 `viewingServer`。
3.  更新 `templates.js` 为设置页面添加开关 UI。
4.  在 `dom.js` 和 `events.js` 中完成新配置项的绑定。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #concept/config #scope/ux #ai/instruct #task/domain/ui #task/object/auto-follow-config #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 更新状态管理逻辑

在 `ui/state.js` 中添加配置项及其更新方法。

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    pageSize: 1000,
    autoSaveInterval: 30,
    lastSavedTime: null,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
  };

  // Async load config
  const config = await storageManager.getConfig();
  state.pageSize = config.pageSize;
  state.autoSaveInterval = config.autoSaveInterval;

  const saveConfig = async () => {
    await storageManager.saveConfig({
      pageSize: state.pageSize,
      autoSaveInterval: state.autoSaveInterval,
    });
  };
~~~~~
~~~~~javascript.new
    pageSize: 1000,
    autoSaveInterval: 30,
    autoFollowServer: true,
    lastSavedTime: null,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
  };

  // Async load config
  const config = await storageManager.getConfig();
  state.pageSize = config.pageSize || 1000;
  state.autoSaveInterval = config.autoSaveInterval || 30;
  state.autoFollowServer = config.autoFollowServer !== false; // 默认为 true

  const saveConfig = async () => {
    await storageManager.saveConfig({
      pageSize: state.pageSize,
      autoSaveInterval: state.autoSaveInterval,
      autoFollowServer: state.autoFollowServer,
    });
  };
~~~~~
~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    setAutoSaveInterval: async (seconds) => {
      const val = Number.parseInt(seconds, 10);
      if (!Number.isNaN(val) && val >= 5) {
        state.autoSaveInterval = val;
        await saveConfig();
      }
    },
    setLastSavedTime: (isoString) => {
~~~~~
~~~~~javascript.new
    setAutoSaveInterval: async (seconds) => {
      const val = Number.parseInt(seconds, 10);
      if (!Number.isNaN(val) && val >= 5) {
        state.autoSaveInterval = val;
        await saveConfig();
      }
    },
    setAutoFollowServer: async (enabled) => {
      state.autoFollowServer = !!enabled;
      await saveConfig();
    },
    setLastSavedTime: (isoString) => {
~~~~~
~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    setActiveServer: (serverName) => {
      state.activeServer = serverName;
      // 如果还没有选择查看哪个服务器，默认跟随当前服务器
      if (!state.viewingServer) {
        state.viewingServer = serverName;
      }
    },
~~~~~
~~~~~javascript.new
    setActiveServer: (serverName) => {
      state.activeServer = serverName;
      // 如果开启了自动跟随，或者这是第一次检测到服务器，则更新查看视图
      if (state.autoFollowServer || !state.viewingServer) {
        state.viewingServer = serverName;
      }
    },
~~~~~

#### Acts 2: 更新 UI 模板与事件绑定

在设置界面添加功能开关。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
            <div class="config-group">
                <label for="log-archive-server-view-selector">查看存档服务器</label>
                <div class="config-input-row">
                    <select id="log-archive-server-view-selector" class="log-archive-ui-button" style="flex-grow: 1; min-width: 0;"></select>
                    <button id="log-archive-reset-server-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="flex-shrink: 0;">📍</button>
                </div>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    切换查看不同服务器的历史记录。注意：此切换仅影响显示，不影响当前的数据录制。
                </div>
            </div>
~~~~~
~~~~~javascript.new
            <div class="config-group">
                <label for="log-archive-server-view-selector">查看存档服务器</label>
                <div class="config-input-row">
                    <select id="log-archive-server-view-selector" class="log-archive-ui-button" style="flex-grow: 1; min-width: 0;"></select>
                    <button id="log-archive-reset-server-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="flex-shrink: 0;">📍</button>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                    <input type="checkbox" id="log-archive-auto-follow-input" style="width: auto; margin: 0;">
                    <label for="log-archive-auto-follow-input" style="font-weight: normal; color: var(--color-text-dim); font-size: 0.85em; cursor: pointer;">跟随游戏服务器切换</label>
                </div>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    切换查看不同服务器的历史记录。注意：此切换仅影响显示，不影响当前的数据录制。
                </div>
            </div>
~~~~~
~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    serverViewSelector: document.getElementById('log-archive-server-view-selector'),
    resetServerButton: document.getElementById('log-archive-reset-server-button'),
    selfNameInput: document.getElementById('log-archive-self-name-input'),
~~~~~
~~~~~javascript.new
    serverViewSelector: document.getElementById('log-archive-server-view-selector'),
    resetServerButton: document.getElementById('log-archive-reset-server-button'),
    autoFollowInput: document.getElementById('log-archive-auto-follow-input'),
    selfNameInput: document.getElementById('log-archive-self-name-input'),
~~~~~
~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.autoSaveIntervalInput.addEventListener('change', async () => {
    await uiState.setAutoSaveInterval(dom.autoSaveIntervalInput.value);
    callbacks.onAutoSaveIntervalChange();
    fullRender();
  });

  dom.saveNowButton.addEventListener('click', async () => {
~~~~~
~~~~~javascript.new
  dom.autoSaveIntervalInput.addEventListener('change', async () => {
    await uiState.setAutoSaveInterval(dom.autoSaveIntervalInput.value);
    callbacks.onAutoSaveIntervalChange();
    fullRender();
  });

  dom.autoFollowInput.addEventListener('change', async () => {
    await uiState.setAutoFollowServer(dom.autoFollowInput.checked);
    fullRender();
  });

  dom.saveNowButton.addEventListener('click', async () => {
~~~~~
~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  // --- Initial value setup ---
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.autoSaveIntervalInput.value = uiState.getState().autoSaveInterval;
}
~~~~~
~~~~~javascript.new
  // --- Initial value setup ---
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.autoSaveIntervalInput.value = uiState.getState().autoSaveInterval;
  dom.autoFollowInput.checked = uiState.getState().autoFollowServer;
}
~~~~~

### 下一步建议

功能已成功实现。在该模式下：
- 当用户进入游戏，`main.js` 检测到服务器名称，调用 `updateServerDisplay`。
- `uiState` 收到通知后，如果配置了 `autoFollowServer: true`，视图会自动从“等待中”变为当前服务器。
- 如果用户手动切换到了“只读模式”浏览其他存档，一旦游戏内服务器发生切换，用户会被自动“拉回”到当前活动的服务器（除非关闭了跟随功能）。

**测试验证**: 建议在不同服务器间跳转，验证设置项的持久化（刷新页面后开关状态是否保持）以及跟随行为是否符合预期。
