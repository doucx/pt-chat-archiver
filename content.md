好的，我将为你创建一个计划，以添加一个专门的配置页面。

这个重构将把设置项（如分页大小、用户名输入框和清空按钮）从主界面移至一个独立的配置视图中，使主界面更加整洁，并为未来添加更多配置选项提供了良好的基础。

## [WIP] feat: 添加专用的配置视图

### 用户需求

用户希望创建一个独立的配置页面，用于统一管理以下设置：
1.  分页大小（每页显示的日志条目数）。
2.  “清空存档”按钮。
3.  “你的昵称”输入框。

同时，分页大小的设置需要被持久化存储。

### 评论

这是一个很好的用户体验改进。将配置项与操作项分离，可以使主界面的功能更加聚焦于日志的浏览和操作。通过持久化分页大小，用户可以根据自己的习惯定制视图，而无需每次都面对默认值。

### 目标

1.  在 `constants.js` 中为新的配置对象添加一个专用的 `localStorage` 键。
2.  在 `templates.js` 中重构 UI 的 HTML 结构，创建一个新的、默认隐藏的配置视图，并将“昵称输入”和“清空”按钮移入其中。
3.  在主界面控件中添加一个“设置”按钮，用于切换主视图和配置视图的可见性。
4.  在 `ui.js` 中实现配置的加载和保存逻辑，特别是对分页大小（`pageSize`）的持久化。
5.  为配置页面中的输入框（分页大小）实现“输入即保存”的双向绑定效果。

### 基本原理

我将引入一个独立的 `config` 状态对象，用于管理所有用户配置。脚本启动时，会从 `localStorage` 加载此配置，如果不存在则使用默认值。在 `ui.js` 中，我将添加视图切换逻辑，通过修改容器的 CSS class 来控制主视图和配置视图的显示/隐藏。配置页面内的输入控件将绑定 `input` 事件，每次变更都会立即更新 `config` 状态对象并将其保存回 `localStorage`，从而实现实时持久化。

### 标签

#intent/build #intent/refine #flow/ready #priority/medium #concept/ui #concept/config #scope/ux #ai/instruct #task/domain/ui #task/object/configuration #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 更新常量和样式

首先，我们在 `constants.js` 中定义配置的存储键。然后，在 `style.css` 中为新的配置视图和激活状态添加样式。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
// 全局配置与状态
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';

export const STORAGE_WARNING_THRESHOLD_MB = 3.5; // 存储警告阈值 (MB)
~~~~~
~~~~~javascript.new
// 全局配置与状态
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
export const CONFIG_KEY = 'chatLogArchiver_config';

export const STORAGE_WARNING_THRESHOLD_MB = 3.5; // 存储警告阈值 (MB)
~~~~~

~~~~~act
patch_file
src/style.css
~~~~~
~~~~~css.old
#log-archive-storage-warning {
  color: #ffcc00;
  font-weight: bold;
  font-size: 0.9em;
  margin-left: 20px;
  flex-shrink: 0;
}
~~~~~
~~~~~css.new
#log-archive-storage-warning {
  color: #ffcc00;
  font-weight: bold;
  font-size: 0.9em;
  margin-left: 20px;
  flex-shrink: 0;
}

/* --- Config View --- */
#log-archive-config-view {
  display: none; /* Hidden by default */
  flex-direction: column;
  gap: 15px;
  padding: 20px;
  background-color: rgba(10, 10, 10, 0.3);
  border-radius: 5px;
  height: 100%;
}
#log-archive-ui-container.config-active #log-archive-main-view {
  display: none;
}
#log-archive-ui-container.config-active #log-archive-config-view {
  display: flex;
}
.config-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.config-section label {
  font-weight: bold;
  color: #a0c8ff;
}
.config-section input[type="text"],
.config-section input[type="number"] {
  padding: 8px;
  background-color: #2a3036;
  border: 1px solid #6c7886;
  border-radius: 4px;
  color: #e0e0e0;
  max-width: 300px;
}
~~~~~

#### Acts 2: 重构 UI 模板

接下来，我们将修改 `templates.js`，将主视图包装起来，并添加新的配置视图结构。同时，将“昵称输入框”和“清空按钮”移动到新视图中，并在主视图的控件栏添加一个“设置”按钮。

~~~~~act
write_file
src/templates.js
~~~~~
~~~~~javascript
/**
 * 返回 UI 主容器的 HTML 结构。
 * @param {string} version - 应用程序版本号。
 * @returns {string}
 */
export const getMainContainerHTML = (version) => `
    <div id="log-archive-ui-header">
        <h2>聊天记录存档 v${version}</h2>
        <div id="log-archive-ui-controls">
            <select id="log-archive-channel-selector" class="log-archive-ui-button"></select>
            <button id="log-archive-refresh-button" class="log-archive-ui-button">刷新</button>
            <button id="log-archive-pause-button" class="log-archive-ui-button">⏸️ </button>
            <button id="log-archive-stats-button" class="log-archive-ui-button">查看统计</button>
            <button id="log-archive-copy-button" class="log-archive-ui-button">复制</button>
            <button id="log-archive-copy-all-button" class="log-archive-ui-button">复制(JSON)</button>
            <button id="log-archive-download-button" class="log-archive-ui-button">下载</button>
            <button id="log-archive-clean-button" class="log-archive-ui-button">清理重复</button>
            <button id="log-archive-settings-button" class="log-archive-ui-button">⚙️ 设置</button>
            <button id="log-archive-close-button" class="log-archive-ui-button">关闭</button>
        </div>
    </div>

    <!-- Main Log View -->
    <div id="log-archive-main-view" style="display: flex; flex-direction: column; height: 100%; min-height: 0;">
      <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
          <button id="page-first" class="log-archive-ui-button">« 第一页</button>
          <button id="page-prev" class="log-archive-ui-button">‹ 上一页</button>
          <span id="page-info" style="font-weight: bold; color: #a0c8ff;"></span>
          <button id="page-next" class="log-archive-ui-button">下一页 ›</button>
          <button id="page-last" class="log-archive-ui-button">最后一页 »</button>
      </div>
      <textarea id="log-archive-ui-log-display" readonly style="margin-top: 10px; flex-grow: 1;"></textarea>
    </div>

    <!-- Configuration View -->
    <div id="log-archive-config-view">
        <h3>设置</h3>
        <div class="config-section">
            <label for="log-archive-self-name-input">你的昵称 (用于私聊方向判断)</label>
            <input type="text" id="log-archive-self-name-input" placeholder="输入你的昵称...">
        </div>
        <div class="config-section">
            <label for="log-archive-page-size-input">每页显示条目数</label>
            <input type="number" id="log-archive-page-size-input" min="100" max="10000" step="100">
        </div>
        <div class="config-section">
            <label>危险操作</label>
            <button id="log-archive-clear-button" class="log-archive-ui-button">清空所有本地存档</button>
        </div>
        <div style="margin-top: auto; display: flex; justify-content: flex-end;">
            <button id="log-archive-config-back-button" class="log-archive-ui-button">返回</button>
        </div>
    </div>
`;

export const TOGGLE_BUTTON_ICON = '📜';
~~~~~

#### Acts 3: 实现配置页面的核心逻辑

最后，在 `ui.js` 中实现所有新功能。这包括加载/保存配置、处理视图切换、将分页大小与新配置关联，以及为新输入框绑定事件监听器。由于改动较大且分散，我们使用 `write_file` 来确保代码的整体一致性。

~~~~~act
write_file
src/ui.js
~~~~~
~~~~~javascript
import { generateStatisticsText } from './analysis.js';
import { CONFIG_KEY, SELF_NAME_KEY, STORAGE_KEY_V5 } from './constants.js';
import { TOGGLE_BUTTON_ICON, getMainContainerHTML } from './templates.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from './utils.js';

/**
 * 更新清理按钮的状态和文本。
 * @param {number} count - 重复项的数量。
 */
function updateCleanButtonState(count) {
  const cleanButton = document.getElementById('log-archive-clean-button');
  if (!cleanButton) return;

  if (count > 0) {
    cleanButton.classList.add('active');
    cleanButton.textContent = `清理重复 (${count})`;
  } else {
    cleanButton.classList.remove('active');
    cleanButton.textContent = '清理重复';
  }
}

function loadConfig() {
  try {
    const configRaw = localStorage.getItem(CONFIG_KEY);
    const defaults = { pageSize: 1000 };
    if (configRaw) {
      return { ...defaults, ...JSON.parse(configRaw) };
    }
    return defaults;
  } catch (e) {
    console.error('Failed to load config, using defaults.', e);
    return { pageSize: 1000 };
  }
}

function saveConfig(configObject) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(configObject));
}

export function createUI(inMemoryChatState, callbacks) {
  const {
    scanAndMergeHistory,
    saveMessagesToStorage,
    cleanChannelRecords,
    detectTotalDuplicates,
    deactivateLogger,
  } = callbacks;

  const configState = loadConfig();

  const uiState = {
    currentPage: 1,
    get pageSize() {
      return configState.pageSize;
    },
    totalPages: 1,
    viewMode: 'log', // 'log' or 'stats'
  };
  let isUIPaused = false;

  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
  container.innerHTML = getMainContainerHTML(__APP_VERSION__);
  document.body.appendChild(container);

  const toggleButton = document.createElement('div');
  toggleButton.id = 'log-archive-ui-toggle-button';
  toggleButton.textContent = TOGGLE_BUTTON_ICON;
  document.body.appendChild(toggleButton);

  // --- Element Selectors ---
  const uiContainer = document.getElementById('log-archive-ui-container');
  const channelSelector = document.getElementById('log-archive-channel-selector');
  const logDisplay = document.getElementById('log-archive-ui-log-display');
  const copyButton = document.getElementById('log-archive-copy-button');
  const copyAllButton = document.getElementById('log-archive-copy-all-button');
  const clearButton = document.getElementById('log-archive-clear-button');
  const closeButton = document.getElementById('log-archive-close-button');
  const refreshButton = document.getElementById('log-archive-refresh-button');
  const selfNameInput = document.getElementById('log-archive-self-name-input');
  const downloadButton = document.getElementById('log-archive-download-button');
  const statsButton = document.getElementById('log-archive-stats-button');
  const pauseButton = document.getElementById('log-archive-pause-button');
  const cleanButton = document.getElementById('log-archive-clean-button');
  const settingsButton = document.getElementById('log-archive-settings-button');
  const configBackButton = document.getElementById('log-archive-config-back-button');
  const pageSizeInput = document.getElementById('log-archive-page-size-input');
  const paginationControls = document.getElementById('log-archive-ui-pagination-controls');
  const pageFirstBtn = document.getElementById('page-first');
  const pagePrevBtn = document.getElementById('page-prev');
  const pageNextBtn = document.getElementById('page-next');
  const pageLastBtn = document.getElementById('page-last');
  const pageInfoSpan = document.getElementById('page-info');

  // --- Initialize Config UI ---
  selfNameInput.value = localStorage.getItem(SELF_NAME_KEY) || '';
  pageSizeInput.value = configState.pageSize;

  selfNameInput.addEventListener('input', () => {
    localStorage.setItem(SELF_NAME_KEY, selfNameInput.value.trim());
  });

  pageSizeInput.addEventListener('input', () => {
    const newSize = parseInt(pageSizeInput.value, 10);
    if (!Number.isNaN(newSize) && newSize >= 100 && newSize <= 10000) {
      configState.pageSize = newSize;
      saveConfig(configState);
      uiState.currentPage = 1; // Reset to first page
      renderCurrentView(); // Re-render with new page size
    }
  });

  cleanButton.addEventListener('click', () => {
    const duplicateCount = detectTotalDuplicates(inMemoryChatState);
    if (duplicateCount === 0) {
      alert('未发现可清理的重复记录。');
      return;
    }

    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${duplicateCount} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      let totalRemoved = 0;
      const cleanedData = {};
      for (const channel in inMemoryChatState) {
        const { cleanedRecords, removedCount } = cleanChannelRecords(inMemoryChatState[channel]);
        cleanedData[channel] = cleanedRecords;
        if (removedCount > 0) {
          totalRemoved += removedCount;
        }
      }
      // Update the state by replacing it entirely
      for (const key of Object.keys(inMemoryChatState)) {
        delete inMemoryChatState[key];
      }
      Object.assign(inMemoryChatState, cleanedData);

      if (totalRemoved > 0) {
        saveMessagesToStorage(inMemoryChatState);
        updateUI();
        updateCleanButtonState(0);
        cleanButton.textContent = '清理完毕!';
        setTimeout(() => {
          updateCleanButtonState(0);
        }, 2000);
      }
    }
  });

  function updateTextareaAndPreserveSelection(updateFn) {
    const isFocused = document.activeElement === logDisplay;
    let selectionStart, selectionEnd;
    if (isFocused) {
      selectionStart = logDisplay.selectionStart;
      selectionEnd = logDisplay.selectionEnd;
    }
    updateFn();
    if (isFocused) {
      logDisplay.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  function formatMessageForDisplay(msg) {
    let prefix = '';
    if (msg.type.includes('party')) prefix = '👥 ';
    else if (msg.type.includes('whisper')) prefix = '💬 ';
    else if (msg.type.includes('announcement')) prefix = '📣 ';
    const displayTime = formatISOTimeForDisplay(msg.time);
    return `${displayTime} ${prefix}${msg.content}`;
  }

  // --- UI Rendering ---
  function updatePaginationControls() {
    pageInfoSpan.textContent = `第 ${uiState.currentPage} / ${uiState.totalPages} 页`;
    pageFirstBtn.disabled = uiState.currentPage === 1;
    pagePrevBtn.disabled = uiState.currentPage === 1;
    pageNextBtn.disabled = uiState.currentPage === uiState.totalPages;
    pageLastBtn.disabled = uiState.currentPage === uiState.totalPages;
  }

  function displayChatLog(messages, channelName) {
    uiState.totalPages = Math.max(1, Math.ceil(messages.length / uiState.pageSize));
    if (uiState.currentPage > uiState.totalPages) {
      uiState.currentPage = uiState.totalPages;
    }

    const startIndex = (uiState.currentPage - 1) * uiState.pageSize;
    const endIndex = startIndex + uiState.pageSize;
    const paginatedMessages = messages.slice(startIndex, endIndex);

    updateTextareaAndPreserveSelection(() => {
      logDisplay.value =
        paginatedMessages.length > 0
          ? paginatedMessages.map(formatMessageForDisplay).join('\n')
          : `--- 在频道 [${channelName}] 中没有记录 ---`;
    });
    updatePaginationControls();
  }

  function displayStatistics(messages, channelName) {
    updateTextareaAndPreserveSelection(() => {
      logDisplay.value = generateStatisticsText(messages, channelName);
    });
  }

  function renderCurrentView() {
    const selectedChannel = channelSelector.value;
    const messages = inMemoryChatState[selectedChannel] || [];

    if (uiState.viewMode === 'stats') {
      paginationControls.style.display = 'none';
      displayStatistics(messages, selectedChannel);
    } else {
      paginationControls.style.display = 'flex';
      displayChatLog(messages, selectedChannel);
    }
  }

  function updateUI() {
    const previouslySelected = channelSelector.value;
    const channels = Object.keys(inMemoryChatState);
    channelSelector.innerHTML = '';
    if (channels.length === 0) {
      channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const channel of channels) {
        const option = document.createElement('option');
        option.value = channel;
        option.textContent = `${channel} (${inMemoryChatState[channel].length})`;
        channelSelector.appendChild(option);
      }
      channelSelector.value =
        previouslySelected && channels.includes(previouslySelected)
          ? previouslySelected
          : channels[0];
    }
    renderCurrentView();
  }

  // --- Event Listeners ---
  toggleButton.addEventListener('click', () => {
    const isVisible = uiContainer.style.display === 'flex';
    if (!isVisible) {
      updateUI();
    }
    uiContainer.style.display = isVisible ? 'none' : 'flex';
  });
  closeButton.addEventListener('click', () => {
    uiContainer.style.display = 'none';
  });
  settingsButton.addEventListener('click', () => {
    uiContainer.classList.add('config-active');
  });
  configBackButton.addEventListener('click', () => {
    uiContainer.classList.remove('config-active');
  });
  channelSelector.addEventListener('change', () => {
    uiState.currentPage = 1;
    renderCurrentView();
  });
  refreshButton.addEventListener('click', () => {
    scanAndMergeHistory();
    saveMessagesToStorage(inMemoryChatState);
    updateUI();
  });
  logDisplay.addEventListener('mousedown', () => {
    if (!isUIPaused) {
      isUIPaused = true;
      pauseButton.textContent = '▶️ ';
      pauseButton.classList.add('paused');
    }
  });
  pauseButton.addEventListener('click', () => {
    isUIPaused = !isUIPaused;
    pauseButton.classList.toggle('paused', isUIPaused);
    pauseButton.textContent = isUIPaused ? '▶️ ' : '⏸️ ';
    if (!isUIPaused) {
      updateUI();
    }
  });
  statsButton.addEventListener('click', () => {
    uiState.viewMode = uiState.viewMode === 'log' ? 'stats' : 'log';
    const isStats = uiState.viewMode === 'stats';
    statsButton.classList.toggle('active', isStats);
    statsButton.textContent = isStats ? '查看记录' : '查看统计';
    renderCurrentView();
  });

  // Pagination listeners
  pageFirstBtn.addEventListener('click', () => {
    if (uiState.currentPage > 1) {
      uiState.currentPage = 1;
      renderCurrentView();
    }
  });
  pagePrevBtn.addEventListener('click', () => {
    if (uiState.currentPage > 1) {
      uiState.currentPage--;
      renderCurrentView();
    }
  });
  pageNextBtn.addEventListener('click', () => {
    if (uiState.currentPage < uiState.totalPages) {
      uiState.currentPage++;
      renderCurrentView();
    }
  });
  pageLastBtn.addEventListener('click', () => {
    if (uiState.currentPage < uiState.totalPages) {
      uiState.currentPage = uiState.totalPages;
      renderCurrentView();
    }
  });

  copyButton.addEventListener('click', () => {
    if (logDisplay.value) {
      navigator.clipboard.writeText(logDisplay.value).then(() => {
        const originalText = copyButton.textContent;
        copyButton.textContent = '已复制!';
        setTimeout(() => {
          copyButton.textContent = originalText;
        }, 1500);
      });
    }
  });
  copyAllButton.addEventListener('click', () => {
    scanAndMergeHistory();
    saveMessagesToStorage(inMemoryChatState);
    updateUI();
    const messages = JSON.stringify(inMemoryChatState, null, 2);
    navigator.clipboard.writeText(messages).then(() => {
      const originalText = copyAllButton.textContent;
      copyAllButton.textContent = '已复制!';
      setTimeout(() => {
        copyAllButton.textContent = originalText;
      }, 1500);
    });
  });
  clearButton.addEventListener('click', () => {
    if (
      confirm(
        '【警告】此操作将清空所有本地存档，并以当前屏幕上可见的聊天记录作为新的起点。确定要重置吗？',
      )
    ) {
      deactivateLogger();
      localStorage.removeItem(STORAGE_KEY_V5);
      for (const key of Object.keys(inMemoryChatState)) {
        delete inMemoryChatState[key];
      }
      scanAndMergeHistory();
      saveMessagesToStorage(inMemoryChatState);
      uiState.viewMode = 'log';
      statsButton.classList.remove('active');
      statsButton.textContent = '查看统计';
      updateUI();
    }
  });
  downloadButton.addEventListener('click', () => {
    if (Object.keys(inMemoryChatState).length === 0) return;
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const baseFilename = `pt-saver-${timestamp}`;
    let allTextContent = '';
    for (const channelName in inMemoryChatState) {
      allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
      allTextContent += inMemoryChatState[channelName].map(formatMessageForDisplay).join('\n');
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
    triggerDownload(
      JSON.stringify(inMemoryChatState, null, 2),
      `${baseFilename}.json`,
      'application/json',
    );
    triggerDownload(allTextContent.trim(), `${baseFilename}.txt`, 'text/plain');
  });

  function checkStorageUsage() {
    const usageMB = getStorageUsageInMB();
    const uiHeader = document.getElementById('log-archive-ui-header');
    let warningElement = document.getElementById('log-archive-storage-warning');
    if (usageMB > 3.5) {
      if (!warningElement) {
        warningElement = document.createElement('div');
        warningElement.id = 'log-archive-storage-warning';
        const controls = document.getElementById('log-archive-ui-controls');
        uiHeader.insertBefore(warningElement, controls);
      }
      warningElement.textContent = `⚠️ 存储占用过高 (${usageMB.toFixed(1)}MB)，请及时下载或清空！`;
    } else if (warningElement) {
      warningElement.remove();
    }
  }

  // Return the control object
  return { updateUI, checkStorageUsage, isUIPaused: () => isUIPaused };
}
~~~~~

### 下一步建议

我们已经成功地将配置项分离到了一个专门的视图中。下一步，我们可以考虑：
-   **增加更多配置**: 例如，可以添加一个选项来配置日志显示的时间格式。
-   **输入验证**: 为分页大小输入框增加更友好的实时验证提示。
-   **主题切换**: 作为一个长远目标，可以在配置页添加一个切换浅色/深色主题的选项。
