This is an excellent, well-thought-out refactoring plan. Decomposing the "God Object" `ui.js` into distinct modules based on the Separation of Concerns principle will dramatically improve the codebase's maintainability, readability, and testability. I will now generate the plan to execute this structural change precisely as you've outlined.

## [WIP] refactor: Decompose ui.js into a modular architecture

### 用户需求
Refactor the monolithic `src/ui.js` file into a modular structure within a new `src/ui/` directory, separating responsibilities for DOM management, UI state, rendering, and event handling.

### 评论
This is a textbook example of a high-value refactoring. The current `ui.js` is a significant source of technical debt, making it difficult to understand, modify, and test. By breaking it down into smaller, focused modules, we make future development faster, safer, and more organized. The proposed structure is logical and follows best practices for modern web development.

### 目标
1.  Create a new directory at `src/ui/`.
2.  Populate `src/ui/` with five new modules: `dom.js`, `state.js`, `renderer.js`, `events.js`, and `index.js`, each containing the specific logic extracted from the original `ui.js` as per the refactoring plan.
3.  Update `src/main.js` to import the `createUI` function from the new `src/ui/index.js` orchestrator.
4.  Delete the now-obsolete `src/ui.js` file.

### 基本原理
The core principle is Separation of Concerns. The current `ui.js` violates the Single Responsibility Principle by managing DOM, state, rendering, and events all at once. This tight coupling makes the code brittle.

The new architecture creates a clear, unidirectional data flow:
1.  `events.js` captures user interactions.
2.  It either calls external `callbacks` (for app-level changes) or updates the UI's internal state via `state.js`.
3.  Any state change triggers a call to `renderer.js`.
4.  `renderer.js` reads the current state from both the application and the UI state module and updates the DOM elements provided by `dom.js`.

This loosely-coupled model isolates responsibilities, making the system easier to reason about and maintain.

### 标签
#intent/refine #flow/ready #priority/high #comp/cli #concept/ui #scope/dx #ai/instruct #task/domain/ui #task/object/module-decomposition #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: Create the new UI directory structure

First, we'll create the new `src/ui` directory to house our refactored modules.

~~~~~act
run_command
~~~~~
~~~~~
mkdir -p src/ui
~~~~~

#### Acts 2: Create the new, modular UI files

We will now create the five new modules by extracting the relevant logic from the old `ui.js` and placing it into the corresponding new files.

First, the DOM manager (`dom.js`), responsible for creating and querying DOM elements.

~~~~~act
write_file
src/ui/dom.js
~~~~~
~~~~~javascript
import { TOGGLE_BUTTON_ICON, getMainContainerHTML } from '../templates.js';

let domElements = null;

/**
 * Creates and injects the main UI container and toggle button into the document body.
 * This function should only be called once.
 * @param {string} version - The application version to display in the header.
 */
export function initDOM(version) {
  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
  container.innerHTML = getMainContainerHTML(version);
  document.body.appendChild(container);

  const toggleButton = document.createElement('div');
  toggleButton.id = 'log-archive-ui-toggle-button';
  toggleButton.textContent = TOGGLE_BUTTON_ICON;
  document.body.appendChild(toggleButton);
}

/**
 * Finds and caches references to all key UI elements.
 * Returns a singleton object containing the element references.
 * @returns {object} An object with references to the UI's DOM elements.
 */
export function getDOMElements() {
  if (domElements) {
    return domElements;
  }

  domElements = {
    // Containers
    uiContainer: document.getElementById('log-archive-ui-container'),
    logView: document.getElementById('log-archive-log-view'),
    configView: document.getElementById('log-archive-config-view'),
    header: document.getElementById('log-archive-ui-header'),

    // Buttons & Inputs
    channelSelector: document.getElementById('log-archive-channel-selector'),
    logDisplay: document.getElementById('log-archive-ui-log-display'),
    copyButton: document.getElementById('log-archive-copy-button'),
    closeButton: document.getElementById('log-archive-close-button'),
    downloadButton: document.getElementById('log-archive-download-button'),
    statsButton: document.getElementById('log-archive-stats-button'),
    settingsButton: document.getElementById('log-archive-settings-button'),
    pauseButton: document.getElementById('log-archive-pause-button'),
    toggleButton: document.getElementById('log-archive-ui-toggle-button'),

    // Config View Controls
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
    cleanButton: document.getElementById('log-archive-clean-button'),
    copyAllButton: document.getElementById('log-archive-copy-all-button'),
    clearButton: document.getElementById('log-archive-clear-button'),

    // Pagination Controls
    paginationControls: document.getElementById('log-archive-ui-pagination-controls'),
    pageFirstBtn: document.getElementById('page-first'),
    pagePrevBtn: document.getElementById('page-prev'),
    pageNextBtn: document.getElementById('page-next'),
    pageLastBtn: document.getElementById('page-last'),
    pageInfoSpan: document.getElementById('page-info'),

    // Status Display
    serverStatus: document.getElementById('log-archive-server-status'),
  };
  return domElements;
}
~~~~~

Next, the UI state manager (`state.js`), which handles internal UI state like pagination and view mode.

~~~~~act
write_file
src/ui/state.js
~~~~~
~~~~~javascript
import { CONFIG_KEY, SELF_NAME_KEY } from '../constants.js';

/**
 * Creates and manages the UI's internal state.
 * @returns {object} A UI state manager instance.
 */
export function createUIState() {
  const state = {
    currentPage: 1,
    pageSize: 1000,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
  };

  const loadConfig = () => {
    const defaultCfg = { pageSize: 1000 };
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      const parsed = stored ? { ...defaultCfg, ...JSON.parse(stored) } : defaultCfg;
      state.pageSize = parsed.pageSize;
    } catch (e) {
      // Use default if config is corrupt
    }
  };

  const saveConfig = () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ pageSize: state.pageSize }));
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
    togglePause: () => {
      state.isUIPaused = !state.isUIPaused;
      return state.isUIPaused;
    },
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
    getSelfName: () => localStorage.getItem(SELF_NAME_KEY) || '',
    setSelfName: (name) => localStorage.setItem(SELF_NAME_KEY, name.trim()),
  };
}
~~~~~

Now, the rendering engine (`renderer.js`), which is responsible for updating the DOM based on state.

~~~~~act
write_file
src/ui/renderer.js
~~~~~
~~~~~javascript
import { generateStatisticsText } from '../analysis.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from '../utils.js';

/**
 * Creates a renderer instance responsible for updating the UI DOM.
 * @param {object} dom - The DOM elements object from dom.js.
 * @param {object} uiState - The UI state manager from state.js.
 * @returns {object} A renderer instance.
 */
export function createRenderer(dom, uiState) {
  // --- Private Helper Functions ---
  const formatMessageForDisplay = (msg) => {
    let prefix = '';
    if (msg.type.includes('party')) prefix = '👥 ';
    else if (msg.type.includes('whisper')) prefix = '💬 ';
    else if (msg.type.includes('announcement')) prefix = '📣 ';
    const displayTime = formatISOTimeForDisplay(msg.time);
    return `${displayTime} ${prefix}${msg.content}`;
  };

  const updateTextareaAndPreserveSelection = (updateFn) => {
    const isFocused = document.activeElement === dom.logDisplay;
    let selectionStart;
    let selectionEnd;
    if (isFocused) {
      selectionStart = dom.logDisplay.selectionStart;
      selectionEnd = dom.logDisplay.selectionEnd;
    }
    updateFn();
    if (isFocused) {
      dom.logDisplay.setSelectionRange(selectionStart, selectionEnd);
    }
  };

  const updateCleanButtonState = (count) => {
    if (count > 0) {
      dom.cleanButton.classList.add('active');
      dom.cleanButton.textContent = `清理重复 (${count})`;
    } else {
      dom.cleanButton.classList.remove('active');
      dom.cleanButton.textContent = '清理重复记录';
    }
  };

  // --- Main Render Logic ---
  const render = (appState, callbacks) => {
    const { viewMode, currentPage, pageSize } = uiState.getState();
    const selectedChannel = dom.channelSelector.value;
    const messages = appState[selectedChannel] || [];

    // Update channel selector
    const channels = Object.keys(appState);
    if (dom.channelSelector.options.length !== channels.length) {
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
        if (selectedChannel && channels.includes(selectedChannel)) {
          dom.channelSelector.value = selectedChannel;
        }
      }
    }

    // Toggle view visibility
    dom.logView.style.display = viewMode === 'config' ? 'none' : 'flex';
    dom.configView.style.display = viewMode === 'config' ? 'flex' : 'none';

    // Update button states
    dom.statsButton.classList.toggle('active', viewMode === 'stats');
    dom.statsButton.textContent = viewMode === 'stats' ? '📜 记录' : '📊 统计';
    dom.settingsButton.classList.toggle('active', viewMode === 'config');

    if (viewMode === 'config') {
      const usageMB = getStorageUsageInMB();
      dom.configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;
      updateCleanButtonState(callbacks.detectTotalDuplicates(appState));
      return;
    }

    if (viewMode === 'stats') {
      dom.paginationControls.style.display = 'none';
      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value = generateStatisticsText(messages, selectedChannel);
      });
    } else {
      // 'log' view
      dom.paginationControls.style.display = 'flex';
      uiState.setTotalPages(Math.ceil(messages.length / pageSize));
      const { totalPages } = uiState.getState(); // Re-fetch after update
      if (currentPage > totalPages) uiState.setPage(totalPages);

      const startIndex = (currentPage - 1) * pageSize;
      const paginatedMessages = messages.slice(startIndex, startIndex + pageSize);

      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value =
          paginatedMessages.length > 0
            ? paginatedMessages.map(formatMessageForDisplay).join('\n')
            : `--- 在频道 [${selectedChannel}] 中没有记录 ---`;
      });

      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = dom.pageLastBtn.disabled = isLast;
    }
  };

  return {
    render,
    updateServerDisplay: (serverName) => {
      if (dom.serverStatus) {
        dom.serverStatus.textContent = serverName ? `服务器: ${serverName}` : '等待进入游戏...';
      }
    },
    checkStorageUsage: () => {
      const usageMB = getStorageUsageInMB();
      let warningElement = document.getElementById('log-archive-storage-warning');
      if (usageMB > 3.5) {
        if (!warningElement) {
          warningElement = document.createElement('div');
          warningElement.id = 'log-archive-storage-warning';
          dom.header.insertBefore(warningElement, dom.header.querySelector('#log-archive-ui-controls'));
        }
        warningElement.textContent = `⚠️ 存储占用过高 (${usageMB.toFixed(1)}MB)，请及时清理！`;
      } else if (warningElement) {
        warningElement.remove();
      }
    },
  };
}
~~~~~

The event coordinator (`events.js`), which handles all user interactions.

~~~~~act
write_file
src/ui/events.js
~~~~~
~~~~~javascript
/**
 * Binds all UI event listeners.
 * @param {object} params - An object containing dependencies.
 * @param {object} params.dom - The DOM elements object.
 * @param {object} params.uiState - The UI state manager.
 * @param {object} params.renderer - The renderer instance.
 * @param {object} params.getAppState - A function to get the current application state.
 * @param {object} params.callbacks - The callbacks object for app-level actions.
 */
export function bindUIEvents({ dom, uiState, renderer, getAppState, callbacks }) {
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
  dom.selfNameInput.addEventListener('change', () => uiState.setSelfName(dom.selfNameInput.value));
  dom.pageSizeInput.addEventListener('change', () => uiState.setPageSize(dom.pageSizeInput.value));

  dom.cleanButton.addEventListener('click', () => {
    callbacks.cleanChannelRecords();
    fullRender(); // Re-render to update button state
  });

  dom.clearButton.addEventListener('click', () => {
    callbacks.clearAllData();
    uiState.setViewMode('log');
    fullRender();
  });

  // --- Data export ---
  dom.copyButton.addEventListener('click', () => {
    if (dom.logDisplay.value) {
      navigator.clipboard.writeText(dom.logDisplay.value).then(() => {
        const originalText = dom.copyButton.textContent;
        dom.copyButton.textContent = '已复制!';
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
  dom.selfNameInput.value = uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
}
~~~~~

Finally, the orchestrator (`index.js`), which ties everything together.

~~~~~act
write_file
src/ui/index.js
~~~~~
~~~~~javascript
import { bindUIEvents } from './events.js';
import { createRenderer } from './renderer.js';
import { createUIState } from './state.js';
import { getDOMElements, initDOM } from './dom.js';

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
    for (const channelName in appState) {
      allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
      allTextContent += appState[channelName]
        .map((msg) => renderer.formatMessageForDisplay(msg)) // Re-use formatter logic if needed or define locally
        .join('\n');
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
          renderer.render(appState, { ...appCallbacks, cleanChannelRecords, copyAllData, downloadAllData }); // Re-render to update button
        }, 2000);
      }
  };

  const clearAllData = () => {
      if(confirm('【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？')) {
        appCallbacks.deactivateLogger();
        localStorage.removeItem('chatLogArchive_v5'); // Direct access for critical op
        for (const key of Object.keys(appState)) {
          delete appState[key];
        }
        appCallbacks.scanAndMergeHistory(); // This will repopulate appState
        appCallbacks.saveMessagesToStorage(appState);
      }
  };

  bindUIEvents({
    dom,
    uiState,
    renderer,
    getAppState,
    callbacks: { ...appCallbacks, cleanChannelRecords, clearAllData, copyAllData, downloadAllData },
  });

  // 4. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        renderer.render(appState, { ...appCallbacks, cleanChannelRecords, copyAllData, downloadAllData });
      }
    },
    checkStorageUsage: renderer.checkStorageUsage,
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: renderer.updateServerDisplay,
  };
}
~~~~~

#### Acts 3: Update main.js and remove the old UI file

Finally, we'll update `main.js` to use the new UI orchestrator and delete the old `ui.js` file.

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import { createUI } from './ui.js';
import {
  debounce,
  formatISOTimeForDisplay,
~~~~~
~~~~~javascript.new
import { createUI } from './ui/index.js';
import {
  debounce,
  formatISOTimeForDisplay,
~~~~~

~~~~~act
delete_file
src/ui.js
~~~~~

### 下一步建议
The structural refactoring is now complete. The next logical step is to verify that the application still functions correctly. I recommend running the application and testing all UI interactions (changing channels, pagination, using the stats and settings views, cleaning data, downloading, etc.) to ensure the new modular architecture has been integrated without regressions. After verification, we can proceed to commit this significant improvement.
