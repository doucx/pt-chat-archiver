## [WIP] refactor: Adapt UI layer to asynchronous storage

### User Need
Complete the async-first refactoring by updating the UI layer (`ui/*.js` and `utils.js`). The UI needs to await storage operations (like saving config, loading state, clearing data) and properly handle the asynchronous nature of the new `StorageManager`.

### Commentary
This step propagates the async changes from the storage layer up to the presentation layer.
- `utils.js`: `getStorageUsageInMB` becomes async.
- `ui/state.js`: `createUIState` becomes an async factory to load initial config. Setters become async to save config.
- `ui/renderer.js`: `checkStorageUsage` becomes async.
- `ui/events.js`: Event listeners are updated to `async/await` operations like saving or clearing data, ensuring the UI reflects the completion of these tasks correctly (e.g., showing "Saved" only after the promise resolves).
- `ui/index.js`: The main UI factory `createUI` becomes async to orchestrate the initialization of the async state manager and DOM.

### Goal
1.  Update `src/utils.js` to use `storageManager` and expose `sleep`.
2.  Refactor `src/ui/state.js` to be an asynchronous state manager.
3.  Update `src/ui/renderer.js` and `src/ui/events.js` to handle async callbacks and data loading.
4.  Wire everything together in `src/ui/index.js`.

### Basic Principle
The UI must not block while waiting for storage IO. By making the UI initialization and interaction handlers async, we ensure the application remains responsive and correctly handles the lifecycle of data persistence, preparing it for the non-blocking nature of IndexedDB.

### Tags
#intent/refine #flow/ready #priority/critical #comp/runtime #concept/ui #scope/core #ai/instruct #task/domain/storage #task/object/ui-layer #task/action/async-refactor #task/state/continue

---

### Script

#### Acts 1: Update Utilities

I'll start by updating `utils.js` to use the new `storageManager` and making the storage size check asynchronous. I'll also add a `sleep` utility as planned.

~~~~~act
patch_file
src/utils.js
~~~~~
~~~~~javascript.old
import { storage } from './storage.js';

/**
 * 计算脚本在 localStorage 中的存储占用空间。
 * @returns {number} - 占用的空间大小，单位是 MB。
 */
export function getStorageUsageInMB() {
  const sizeInBytes = storage.getMessagesRawSize();
  return sizeInBytes / (1024 * 1024);
}

/**
 * 防抖函数。
~~~~~
~~~~~javascript.new
import { storageManager } from './storage/index.js';

/**
 * 计算脚本在 localStorage 中的存储占用空间。
 * @returns {Promise<number>} - 占用的空间大小，单位是 MB。
 */
export async function getStorageUsageInMB() {
  const sizeInBytes = await storageManager.getRawSize();
  return sizeInBytes / (1024 * 1024);
}

/**
 * 简单的异步等待函数
 * @param {number} ms - 毫秒数
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 防抖函数。
~~~~~

#### Acts 2: Async UI State Manager

Now I will refactor `src/ui/state.js`. `createUIState` will become an async function because it needs to load configuration from storage. Accessors for persistent data (like `selfName`) will also become async.

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
import { storage } from '../storage.js';

/**
 * Creates and manages the UI's internal state.
 * @returns {object} A UI state manager instance.
 */
export function createUIState() {
  const state = {
    currentPage: 1,
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

  // Initial load
  loadConfig();

  return {
    getState: () => ({ ...state }),

    setPage: (page) => {
      state.currentPage = Math.max(1, Math.min(page, state.totalPages));
    },
    setTotalPages: (total) => {
      state.totalPages = Math.max(1, total);
    },
    setViewMode: (mode) => {
      if (['log', 'stats', 'config'].includes(mode)) {
        state.viewMode = mode;
      }
    },
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
    togglePause: () => {
      state.isUIPaused = !state.isUIPaused;
      return state.isUIPaused;
    },
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
~~~~~javascript.new
import { storageManager } from '../storage/index.js';

/**
 * Creates and manages the UI's internal state.
 * @returns {Promise<object>} A promise that resolves to a UI state manager instance.
 */
export async function createUIState() {
  const state = {
    currentPage: 1,
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

  return {
    getState: () => ({ ...state }),

    setPage: (page) => {
      state.currentPage = Math.max(1, Math.min(page, state.totalPages));
    },
    setTotalPages: (total) => {
      state.totalPages = Math.max(1, total);
    },
    setViewMode: (mode) => {
      if (['log', 'stats', 'config'].includes(mode)) {
        state.viewMode = mode;
      }
    },
    setPageSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        await saveConfig();
      }
    },
    setAutoSaveInterval: async (seconds) => {
      const val = Number.parseInt(seconds, 10);
      if (!Number.isNaN(val) && val >= 5) {
        state.autoSaveInterval = val;
        await saveConfig();
      }
    },
    setLastSavedTime: (isoString) => {
      state.lastSavedTime = isoString;
    },
    togglePause: () => {
      state.isUIPaused = !state.isUIPaused;
      return state.isUIPaused;
    },
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
    getSelfName: async () => await storageManager.getSelfName(),
    setSelfName: async (name) => await storageManager.setSelfName(name),
  };
}
~~~~~

#### Acts 3: Async Renderer

The `renderer.js` needs a small but crucial update to await `getStorageUsageInMB`.

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
  return {
    render,
    checkStorageUsage: () => {
      const usageMB = getStorageUsageInMB();
      let warningElement = document.getElementById('log-archive-storage-warning');
      if (usageMB > 3.5) {
        if (!warningElement) {
          warningElement = document.createElement('div');
          warningElement.id = 'log-archive-storage-warning';
          dom.header.insertBefore(
            warningElement,
            dom.header.querySelector('#log-archive-ui-controls'),
          );
        }
        warningElement.textContent = `⚠️ 存储占用过高 (${usageMB.toFixed(1)}MB)，请及时清理！`;
      } else if (warningElement) {
        warningElement.remove();
      }
    },
  };
}
~~~~~
~~~~~javascript.new
  return {
    render,
    checkStorageUsage: async () => {
      const usageMB = await getStorageUsageInMB();
      let warningElement = document.getElementById('log-archive-storage-warning');
      if (usageMB > 3.5) {
        if (!warningElement) {
          warningElement = document.createElement('div');
          warningElement.id = 'log-archive-storage-warning';
          dom.header.insertBefore(
            warningElement,
            dom.header.querySelector('#log-archive-ui-controls'),
          );
        }
        warningElement.textContent = `⚠️ 存储占用过高 (${usageMB.toFixed(1)}MB)，请及时清理！`;
      } else if (warningElement) {
        warningElement.remove();
      }
    },
  };
}
~~~~~

#### Acts 4: Update Event Listeners

In `src/ui/events.js`, I need to update the binding function to be async (to load initial values) and update listeners to properly `await` async callbacks (like manual save or clear data).

~~~~~act
write_file
src/ui/events.js
~~~~~
~~~~~javascript.new
/**
 * Binds all UI event listeners.
 * @param {object} params - An object containing dependencies.
 * @param {object} params.dom - The DOM elements object.
 * @param {object} params.uiState - The UI state manager.
 * @param {object} params.renderer - The renderer instance.
 * @param {object} params.getAppState - A function to get the current application state.
 * @param {object} params.callbacks - The callbacks object for app-level actions.
 */
export async function bindUIEvents({ dom, uiState, renderer, getAppState, callbacks }) {
  const fullRender = () => renderer.render(getAppState(), callbacks);

  // --- Main UI controls ---
  dom.toggleButton.addEventListener('click', () => {
    const isVisible = dom.uiContainer.style.display === 'flex';
    if (!isVisible) fullRender();
    dom.uiContainer.style.display = isVisible ? 'none' : 'flex';
  });

  dom.closeButton.addEventListener('click', () => {
    dom.uiContainer.style.display = 'none';
  });

  dom.pauseButton.addEventListener('click', () => {
    const isPaused = uiState.togglePause();
    dom.pauseButton.classList.toggle('paused', isPaused);
    dom.pauseButton.textContent = isPaused ? '▶️ ' : '⏸️ ';
    if (!isPaused) fullRender();
  });

  dom.channelSelector.addEventListener('change', () => {
    uiState.setPage(1);
    fullRender();
  });

  dom.serverViewSelector.addEventListener('change', () => {
    uiState.setViewingServer(dom.serverViewSelector.value);
    uiState.setPage(1);
    fullRender();
  });

  dom.resetServerButton.addEventListener('click', () => {
    const { activeServer } = uiState.getState();
    if (activeServer) {
      uiState.setViewingServer(activeServer);
      uiState.setPage(1);
      fullRender();
    }
  });

  // --- View switching ---
  dom.settingsButton.addEventListener('click', () => {
    const currentMode = uiState.getState().viewMode;
    uiState.setViewMode(currentMode === 'config' ? 'log' : 'config');
    fullRender();
  });

  dom.statsButton.addEventListener('click', () => {
    const currentMode = uiState.getState().viewMode;
    uiState.setViewMode(currentMode === 'stats' ? 'log' : 'stats');
    fullRender();
  });

  // --- Log display interaction ---
  dom.logDisplay.addEventListener('mousedown', () => {
    if (!uiState.getState().isUIPaused) {
      uiState.forcePause(true);
      dom.pauseButton.textContent = '▶️ ';
      dom.pauseButton.classList.add('paused');
    }
  });

  // --- Pagination ---
  dom.pageFirstBtn.addEventListener('click', () => {
    uiState.setPage(1);
    fullRender();
  });
  dom.pagePrevBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().currentPage - 1);
    fullRender();
  });
  dom.pageNextBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().currentPage + 1);
    fullRender();
  });
  dom.pageLastBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().totalPages);
    fullRender();
  });

  // --- Config view actions ---
  dom.selfNameInput.addEventListener('change', async () => {
    await uiState.setSelfName(dom.selfNameInput.value);
  });
  dom.pageSizeInput.addEventListener('change', async () => {
    await uiState.setPageSize(dom.pageSizeInput.value);
    fullRender();
  });

  dom.autoSaveIntervalInput.addEventListener('change', async () => {
    await uiState.setAutoSaveInterval(dom.autoSaveIntervalInput.value);
    callbacks.onAutoSaveIntervalChange();
    fullRender();
  });

  dom.saveNowButton.addEventListener('click', async () => {
    await callbacks.manualSave();
    const originalText = dom.saveNowButton.textContent;
    dom.saveNowButton.textContent = '✅ 已保存';
    setTimeout(() => {
      dom.saveNowButton.textContent = originalText;
    }, 1500);
  });

  dom.cleanButton.addEventListener('click', async () => {
    await callbacks.cleanChannelRecords();
    fullRender(); // Re-render to update button state
  });

  dom.clearButton.addEventListener('click', async () => {
    await callbacks.clearAllData();
    uiState.setViewMode('log');
    fullRender();
  });

  // --- Data export ---
  dom.copyButton.addEventListener('click', () => {
    if (dom.logDisplay.value) {
      navigator.clipboard.writeText(dom.logDisplay.value).then(() => {
        const originalText = dom.copyButton.textContent;
        dom.copyButton.textContent = '✅';
        setTimeout(() => {
          dom.copyButton.textContent = originalText;
        }, 1500);
      });
    }
  });

  dom.copyAllButton.addEventListener('click', () => {
    callbacks.copyAllData();
    const originalText = dom.copyAllButton.textContent;
    dom.copyAllButton.textContent = '已复制 JSON!';
    setTimeout(() => {
      dom.copyAllButton.textContent = originalText;
    }, 1500);
  });

  dom.downloadButton.addEventListener('click', () => callbacks.downloadAllData());

  // --- Initial value setup ---
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.autoSaveIntervalInput.value = uiState.getState().autoSaveInterval;
}
~~~~~

#### Acts 5: Update UI Entry Point

Finally, I will update `src/ui/index.js` to coordinate all these async components.

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
import { storage } from '../storage.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
import { createRenderer, formatMessageForDisplay } from './renderer.js';
import { createUIState } from './state.js';

/**
 * Initializes and orchestrates the entire UI module.
 * @param {object} initialAppState - The initial application state (inMemoryChatState).
 * @param {object} appCallbacks - Callbacks for application-level actions.
 * @returns {object} Public API for the UI module.
 */
export function createUI(initialAppState, appCallbacks) {
  let appState = initialAppState;

  // 1. Initialize DOM structure
  initDOM(__APP_VERSION__);
  const dom = getDOMElements();

  // 2. Create state and renderer instances
  const uiState = createUIState();
  const renderer = createRenderer(dom, uiState);

  // 3. Prepare callbacks and bind events
  const getAppState = () => appState;

  const downloadAllData = () => {
    if (Object.keys(appState).length === 0) return;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const baseFilename = `pt-saver-${timestamp}`;
    let allTextContent = '';

    // V6 结构: appState[serverName][channelName]
    for (const serverName in appState) {
      allTextContent += '\n\n############################################################\n';
      allTextContent += `## 服务器: ${serverName}\n`;
      allTextContent += '############################################################\n';

      const serverData = appState[serverName];
      for (const channelName in serverData) {
        allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
        const messages = serverData[channelName];
        if (Array.isArray(messages)) {
          allTextContent += messages.map(formatMessageForDisplay).join('\n');
        }
      }
    }

    const triggerDownload = (content, filename, mimeType) => {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    triggerDownload(JSON.stringify(appState, null, 2), `${baseFilename}.json`, 'application/json');
    triggerDownload(allTextContent.trim(), `${baseFilename}.txt`, 'text/plain');
  };

  const copyAllData = () => {
    const messages = JSON.stringify(appState, null, 2);
    navigator.clipboard.writeText(messages);
  };

  const cleanChannelRecords = () => {
    const duplicateCount = appCallbacks.detectTotalDuplicates(appState);
    if (duplicateCount === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${duplicateCount} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const channel in appState) {
        const { cleanedRecords } = appCallbacks.cleanChannelRecords(appState[channel]);
        appState[channel] = cleanedRecords;
      }
      appCallbacks.saveMessagesToStorage(appState);
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        renderer.render(appState, uiCallbacks); // Re-render to update button
      }, 2000);
    }
  };

  const clearAllData = () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      storage.clearAllMessages();
      for (const key of Object.keys(appState)) {
        delete appState[key];
      }
      appCallbacks.scanAndMergeHistory(); // This will repopulate appState
      appCallbacks.saveMessagesToStorage(appState);
      renderer.render(appState, uiCallbacks);
    }
  };

  const uiCallbacks = {
    ...appCallbacks,
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    downloadAllData,
  };

  bindUIEvents({
    dom,
    uiState,
    renderer,
    getAppState,
    callbacks: uiCallbacks,
  });

  // 4. Initial Render
  renderer.render(appState, uiCallbacks);

  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        renderer.render(appState, uiCallbacks);
      }
    },
    setState: (newState) => {
      appState = newState;
      renderer.render(appState, uiCallbacks);
    },
    checkStorageUsage: renderer.checkStorageUsage,
    isUIPaused: () => uiState.getState().isUIPaused,
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
~~~~~javascript.new
import { storageManager } from '../storage/index.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
import { createRenderer, formatMessageForDisplay } from './renderer.js';
import { createUIState } from './state.js';

/**
 * Initializes and orchestrates the entire UI module.
 * @param {object} initialAppState - The initial application state (inMemoryChatState).
 * @param {object} appCallbacks - Callbacks for application-level actions.
 * @returns {Promise<object>} Public API for the UI module.
 */
export async function createUI(initialAppState, appCallbacks) {
  let appState = initialAppState;

  // 1. Initialize DOM structure
  initDOM(__APP_VERSION__);
  const dom = getDOMElements();

  // 2. Create state and renderer instances
  const uiState = await createUIState();
  const renderer = createRenderer(dom, uiState);

  // 3. Prepare callbacks and bind events
  const getAppState = () => appState;

  const downloadAllData = () => {
    if (Object.keys(appState).length === 0) return;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const baseFilename = `pt-saver-${timestamp}`;
    let allTextContent = '';

    // V6 结构: appState[serverName][channelName]
    for (const serverName in appState) {
      allTextContent += '\n\n############################################################\n';
      allTextContent += `## 服务器: ${serverName}\n`;
      allTextContent += '############################################################\n';

      const serverData = appState[serverName];
      for (const channelName in serverData) {
        allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
        const messages = serverData[channelName];
        if (Array.isArray(messages)) {
          allTextContent += messages.map(formatMessageForDisplay).join('\n');
        }
      }
    }

    const triggerDownload = (content, filename, mimeType) => {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    triggerDownload(JSON.stringify(appState, null, 2), `${baseFilename}.json`, 'application/json');
    triggerDownload(allTextContent.trim(), `${baseFilename}.txt`, 'text/plain');
  };

  const copyAllData = () => {
    const messages = JSON.stringify(appState, null, 2);
    navigator.clipboard.writeText(messages);
  };

  const cleanChannelRecords = async () => {
    const duplicateCount = appCallbacks.detectTotalDuplicates(appState);
    if (duplicateCount === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${duplicateCount} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const channel in appState) {
        const { cleanedRecords } = appCallbacks.cleanChannelRecords(appState[channel]);
        appState[channel] = cleanedRecords;
      }
      await appCallbacks.saveMessagesToStorage(appState);
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        renderer.render(appState, uiCallbacks); // Re-render to update button
      }, 2000);
    }
  };

  const clearAllData = async () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      await storageManager.clearAllData();
      for (const key of Object.keys(appState)) {
        delete appState[key];
      }
      await appCallbacks.scanAndMergeHistory(); // This will repopulate appState
      await appCallbacks.saveMessagesToStorage(appState);
      renderer.render(appState, uiCallbacks);
    }
  };

  const uiCallbacks = {
    ...appCallbacks,
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    downloadAllData,
  };

  await bindUIEvents({
    dom,
    uiState,
    renderer,
    getAppState,
    callbacks: uiCallbacks,
  });

  // 4. Initial Render
  renderer.render(appState, uiCallbacks);

  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        renderer.render(appState, uiCallbacks);
      }
    },
    setState: (newState) => {
      appState = newState;
      renderer.render(appState, uiCallbacks);
    },
    checkStorageUsage: async () => await renderer.checkStorageUsage(),
    isUIPaused: () => uiState.getState().isUIPaused,
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

### 下一步建议
With the application logic fully refactored, the next logical step is to update the test suite to match the new asynchronous reality.
I recommend updating `tests/storage.test.js`, `tests/ui.integration.test.js`, and `tests/ui_state.test.js`.
The tests will need to:
1.  Use `await` for almost all storage interactions.
2.  Use `await` when initializing the UI in integration tests.
3.  Mock the async storage manager instead of the old synchronous storage object.
