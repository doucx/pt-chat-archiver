这是一个非常实用的改进。增加“上次保存时间”和“立即保存”按钮能显著降低用户对数据丢失的焦虑，而可调的“自动保存间隔”则让用户能在性能和安全性之间取得平衡。

## [WIP] feat(ui): 增强存档安全性：添加手动保存、自动保存间隔配置及状态显示

### 用户需求
1.  **可见性**: 在设置页面显示“上次保存时间”，让用户确信脚本正在工作。
2.  **控制权**: 提供“立即保存”按钮，允许用户在重要对话后立即触发持久化。
3.  **自定义**: 允许用户配置自动保存的频率（间隔秒数）。

### 评论
这些功能将原本黑盒化的自动保存过程透明化了。对于一个依赖浏览器本地存储的项目，提供这种程度的确定性对提升用户体验至关重要。

### 目标
1.  更新 `storage.js` 和 `state.js` 以支持 `autoSaveInterval` 的持久化。
2.  在设置界面添加对应的 HTML 元素。
3.  在 UI 模块中增加更新保存时间的 API。
4.  在 `main.js` 中重构自动保存逻辑，使其支持动态间隔和手动触发。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #comp/build #concept/config #concept/state #scope/ux #ai/brainstorm #task/domain/ui #task/object/save-mechanism #task/action/build #task/state/continue

---

### Script

#### Acts 1: 更新存储与状态管理

我们将默认自动保存间隔设为 30 秒，并在 UI 状态中记录最后保存时间。

~~~~~act
patch_file
src/storage.js
~~~~~
~~~~~javascript.old
  // --- 配置 (Config) ---
  getConfig() {
    const defaultCfg = { pageSize: 1000 };
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
~~~~~
~~~~~javascript.new
  // --- 配置 (Config) ---
  getConfig() {
    const defaultCfg = { pageSize: 1000, autoSaveInterval: 30 };
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
~~~~~

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    pageSize: 1000,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
  };

  const loadConfig = () => {
    const config = storage.getConfig();
    state.pageSize = config.pageSize;
  };

  const saveConfig = () => {
    storage.saveConfig({ pageSize: state.pageSize });
  };
~~~~~
~~~~~javascript.new
    pageSize: 1000,
    autoSaveInterval: 30,
    lastSavedTime: null,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
  };

  const loadConfig = () => {
    const config = storage.getConfig();
    state.pageSize = config.pageSize;
    state.autoSaveInterval = config.autoSaveInterval;
  };

  const saveConfig = () => {
    storage.saveConfig({
      pageSize: state.pageSize,
      autoSaveInterval: state.autoSaveInterval,
    });
  };
~~~~~
~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    setPageSize: (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        saveConfig();
      }
    },
~~~~~
~~~~~javascript.new
    setPageSize: (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        saveConfig();
      }
    },
    setAutoSaveInterval: (seconds) => {
      const val = Number.parseInt(seconds, 10);
      if (!Number.isNaN(val) && val >= 5) {
        state.autoSaveInterval = val;
        saveConfig();
      }
    },
    setLastSavedTime: (isoString) => {
      state.lastSavedTime = isoString;
    },
~~~~~

#### Acts 2: 更新 UI 模板 (templates.js)

在设置视图中添加保存信息和配置项。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" class="info-text-dim" style="margin-bottom: 5px;"></div>
                <div class="config-actions" style="display: flex; gap: 10px;">
                    <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">清理重复记录</button>
                    <button id="log-archive-copy-all-button" class="log-archive-ui-button" style="flex-grow: 1;">导出 JSON</button>
                </div>
            </div>
~~~~~
~~~~~javascript.new
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>自动保存间隔 (秒)</label>
                <input type="number" id="log-archive-auto-save-interval" min="5" max="3600" step="5">
            </div>
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" class="info-text-dim" style="margin-bottom: 5px;"></div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button id="log-archive-save-now-button" class="log-archive-ui-button" style="flex-grow: 1;">💾 立即保存</button>
                        <span id="log-archive-last-saved-info" class="info-text-dim" style="font-size: 0.8em; white-space: nowrap;">未保存</span>
                    </div>
                    <div class="config-actions" style="display: flex; gap: 10px;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">清理重复记录</button>
                        <button id="log-archive-copy-all-button" class="log-archive-ui-button" style="flex-grow: 1;">导出 JSON</button>
                    </div>
                </div>
            </div>
~~~~~

#### Acts 3: 更新 DOM 映射、渲染与事件

我们需要处理新添加的输入框、按钮和信息展示位。

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
    cleanButton: document.getElementById('log-archive-clean-button'),
~~~~~
~~~~~javascript.new
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    autoSaveIntervalInput: document.getElementById('log-archive-auto-save-interval'),
    lastSavedInfo: document.getElementById('log-archive-last-saved-info'),
    saveNowButton: document.getElementById('log-archive-save-now-button'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
    cleanButton: document.getElementById('log-archive-clean-button'),
~~~~~

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
import { generateStatisticsText } from '../analysis.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from '../utils.js';
~~~~~
~~~~~javascript.new
import { generateStatisticsText } from '../analysis.js';
import {
  formatISOTimeForDisplay,
  getStorageUsageInMB,
} from '../utils.js';
~~~~~
~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    if (viewMode === 'config') {
      const usageMB = getStorageUsageInMB();
      dom.configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;
      updateCleanButtonState(callbacks.detectTotalDuplicates(appState));
      return;
    }
~~~~~
~~~~~javascript.new
    if (viewMode === 'config') {
      const usageMB = getStorageUsageInMB();
      dom.configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;
      
      const { lastSavedTime } = uiState.getState();
      if (lastSavedTime) {
        dom.lastSavedInfo.textContent = `上次保存: ${formatISOTimeForDisplay(lastSavedTime).split(' ')[1]}`;
      } else {
        dom.lastSavedInfo.textContent = '尚未保存';
      }
      
      updateCleanButtonState(callbacks.detectTotalDuplicates(appState));
      return;
    }
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.pageSizeInput.addEventListener('change', () => {
    uiState.setPageSize(dom.pageSizeInput.value);
    fullRender();
  });

  dom.cleanButton.addEventListener('click', () => {
~~~~~
~~~~~javascript.new
  dom.pageSizeInput.addEventListener('change', () => {
    uiState.setPageSize(dom.pageSizeInput.value);
    fullRender();
  });

  dom.autoSaveIntervalInput.addEventListener('change', () => {
    uiState.setAutoSaveInterval(dom.autoSaveIntervalInput.value);
    callbacks.onAutoSaveIntervalChange();
    fullRender();
  });

  dom.saveNowButton.addEventListener('click', () => {
    callbacks.manualSave();
    const originalText = dom.saveNowButton.textContent;
    dom.saveNowButton.textContent = '✅ 已保存';
    setTimeout(() => {
      dom.saveNowButton.textContent = originalText;
    }, 1500);
  });

  dom.cleanButton.addEventListener('click', () => {
~~~~~
~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  // --- Initial value setup ---
  dom.selfNameInput.value = uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
}
~~~~~
~~~~~javascript.new
  // --- Initial value setup ---
  dom.selfNameInput.value = uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.autoSaveIntervalInput.value = uiState.getState().autoSaveInterval;
}
~~~~~

#### Acts 4: 暴露接口并重构 main.js

我们需要在 `index.js` 暴露新方法，并修改 `main.js` 以支持动态定时的自动保存。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      renderer.render(appState, uiCallbacks);
    },
  };
}
~~~~~
~~~~~javascript.new
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      renderer.render(appState, uiCallbacks);
    },
    setLastSavedTime: (time) => {
      uiState.setLastSavedTime(time);
      renderer.render(appState, uiCallbacks);
    },
    getAutoSaveInterval: () => uiState.getState().autoSaveInterval,
  };
}
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  // UI 控制句柄
  let uiControls = null;
~~~~~
~~~~~javascript.new
  // UI 控制句柄
  let uiControls = null;
  let autoSaveTimer = null;
~~~~~
~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /** 脚本主入口函数。*/
  function main() {
    // 1. 执行静默迁移 (如 v4 -> v5)
    MigrationManager.runSilentMigrations();

    // 2. 加载状态与初始化 UI
    inMemoryChatState = loadMessagesFromStorage();
    uiControls = createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage,
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
    });
~~~~~
~~~~~javascript.new
  /** 执行一次完整的保存动作并更新 UI。*/
  function performAutoSave() {
    saveMessagesToStorage(inMemoryChatState);
    if (uiControls) {
      uiControls.setLastSavedTime(getISOTimestamp());
      uiControls.checkStorageUsage();
    }
  }

  /** (重新)启动自动保存定时器。*/
  function startAutoSaveTimer() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    const intervalSeconds = uiControls ? uiControls.getAutoSaveInterval() : 30;
    console.log(`[Archiver] 自动保存定时器启动，间隔: ${intervalSeconds}s`);
    autoSaveTimer = setInterval(performAutoSave, intervalSeconds * 1000);
  }

  /** 脚本主入口函数。*/
  function main() {
    // 1. 执行静默迁移 (如 v4 -> v5)
    MigrationManager.runSilentMigrations();

    // 2. 加载状态与初始化 UI
    inMemoryChatState = loadMessagesFromStorage();
    uiControls = createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage,
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
      manualSave: performAutoSave,
      onAutoSaveIntervalChange: startAutoSaveTimer,
    });
~~~~~
~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    uiObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

    setInterval(() => {
      saveMessagesToStorage(inMemoryChatState);
      uiControls.checkStorageUsage();
    }, 15000);

    let lastDuplicateCount = -1;
~~~~~
~~~~~javascript.new
    uiObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

    startAutoSaveTimer();

    let lastDuplicateCount = -1;
~~~~~

### 下一步建议
- **保存冲突提示**: 如果用户在多个标签页同时开启脚本，可能会产生存储覆盖，可以考虑在 `performAutoSave` 中检查存储版本。
- **UI 增强**: 在点击“立即保存”时，除了按钮文字变化，可以考虑在 `logDisplay` 的顶部短暂显示一条浮动的“系统消息”。
- **极端测试**: 测试将自动保存间隔设为极短（如 5 秒）在低性能设备或存档体积巨大（>4MB）时的表现。
