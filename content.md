好的。我将按照你的要求，在不删除现有核心功能（如多文件下载、选择区域保留等）的前提下，为系统添加一个配置页面，并将相关控件（分页大小、清空、用户名）移至该页面。

我们将引入一个新的配置存储键，并重构 UI 布局以支持多视图（日志视图、统计视图、配置视图）的切换。

## [WIP] feat: 添加配置页面并重构 UI 布局以支持动态分页和设置持久化

### 用户需求
1.  **新增配置页**: 提供一个独立的 UI 视图用于存放非高频操作的控件。
2.  **设置项**: 包括“分页大小”、“用户昵称”和“清空存档”。
3.  **持久化**: 配置信息（如分页大小）需要保存到 `localStorage`。
4.  **体验优化**: 清理冗余的顶栏，使界面更清爽。

### 评论
随着功能的增加，顶栏按钮过多会导致在小屏幕或窄窗口下布局紊乱。通过引入“视图切换”机制，我们可以将“管理类”操作移入设置页面。同时，支持动态调整分页大小能让处理超大存档的用户获得更好的性能表现。

### 目标
1.  在 `constants.js` 定义 `CONFIG_KEY`。
2.  在 `style.css` 添加配置页专用的网格和表单样式。
3.  重构 `templates.js`，将 UI 划分为 `log-view` 和 `config-view` 容器，并更新顶栏。
4.  在 `ui.js` 中实现配置加载、保存逻辑，以及多视图切换的渲染逻辑。
5.  确保现有的“下载”、“复制”和“统计分析”功能在重构后依然完整可用。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #concept/config #scope/ux #ai/delegate #task/domain/ui #task/object/settings-view #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 更新常量定义

添加用于存储用户配置的 Key。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';

export const STORAGE_WARNING_THRESHOLD_MB = 3.5; // 存储警告阈值 (MB)
~~~~~
~~~~~javascript.new
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
export const CONFIG_KEY = 'chatLogArchive_config';

export const STORAGE_WARNING_THRESHOLD_MB = 3.5; // 存储警告阈值 (MB)
~~~~~

#### Acts 2: 添加设置页面的 CSS 样式

为设置界面的分组、表单元素以及新的激活状态添加样式。

~~~~~act
patch_file
src/style.css
~~~~~
~~~~~css.old
#log-archive-stats-button.active {
  background-color: #3a8c54;
  border-color: #4da669;
  color: #fff;
}
#log-archive-ui-toggle-button {
~~~~~
~~~~~css.new
#log-archive-stats-button.active {
  background-color: #3a8c54;
  border-color: #4da669;
  color: #fff;
}
#log-archive-settings-button.active {
  background-color: #8c6a3a;
  border-color: #a6864d;
}

/* 设置页面样式 */
.config-section {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}
.config-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.config-group label {
  font-weight: bold;
  color: #8af;
  font-size: 0.9em;
}
.config-group input {
  padding: 8px;
  background: #2a3036;
  border: 1px solid #4a545e;
  color: white;
  border-radius: 4px;
}
.config-actions {
  margin-top: 5px;
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}
#log-archive-ui-toggle-button {
~~~~~

#### Acts 3: 重构 UI 模板结构

重构 HTML 结构，引入视图容器，并将控制按钮重新分配。

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
            <button id="log-archive-stats-button" class="log-archive-ui-button">📊 统计</button>
            <button id="log-archive-settings-button" class="log-archive-ui-button">⚙️ 设置</button>
            <button id="log-archive-copy-button" class="log-archive-ui-button">复制</button>
            <button id="log-archive-download-button" class="log-archive-ui-button">下载</button>
            <button id="log-archive-close-button" class="log-archive-ui-button">关闭</button>
        </div>
    </div>
    
    <div id="log-archive-view-container" style="flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
        <!-- 记录查看视图 -->
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
                <button id="page-first" class="log-archive-ui-button">«</button>
                <button id="page-prev" class="log-archive-ui-button">‹</button>
                <span id="page-info" style="font-weight: bold; color: #a0c8ff;"></span>
                <button id="page-next" class="log-archive-ui-button">›</button>
                <button id="page-last" class="log-archive-ui-button">»</button>
            </div>
            <textarea id="log-archive-ui-log-display" readonly style="margin-top: 10px; flex-grow: 1;"></textarea>
        </div>

        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>维护操作</label>
                <div class="config-actions">
                    <button id="log-archive-clean-button" class="log-archive-ui-button">清理重复记录</button>
                    <button id="log-archive-copy-all-button" class="log-archive-ui-button">导出原始数据 (JSON)</button>
                </div>
            </div>
            <div class="config-group" style="margin-top: auto; border-top: 1px dashed #444; padding-top: 20px;">
                <label style="color: #ff6666;">危险操作</label>
                <button id="log-archive-clear-button" class="log-archive-ui-button">清空所有本地存档</button>
            </div>
        </div>
    </div>
`;

export const TOGGLE_BUTTON_ICON = '📜';
~~~~~

#### Acts 4: 重构 `ui.js` 以支持配置和多视图切换

实现设置持久化、动态分页逻辑，以及视图切换渲染。

~~~~~act
write_file
src/ui.js
~~~~~
~~~~~javascript
import { generateStatisticsText } from './analysis.js';
import { SELF_NAME_KEY, STORAGE_KEY_V5, CONFIG_KEY } from './constants.js';
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
    cleanButton.textContent = '清理重复记录';
  }
}

export function createUI(inMemoryChatState, callbacks) {
  const {
    scanAndMergeHistory,
    saveMessagesToStorage,
    cleanChannelRecords,
    detectTotalDuplicates,
    deactivateLogger,
  } = callbacks;

  // --- 配置管理 ---
  const loadConfig = () => {
    const defaultCfg = { pageSize: 1000 };
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      return stored ? { ...defaultCfg, ...JSON.parse(stored) } : defaultCfg;
    } catch (e) {
      return defaultCfg;
    }
  };

  const config = loadConfig();

  const uiState = {
    currentPage: 1,
    pageSize: config.pageSize,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
  };
  let isUIPaused = false;

  // --- 初始化 DOM ---
  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
  container.innerHTML = getMainContainerHTML(__APP_VERSION__);
  document.body.appendChild(container);

  const toggleButton = document.createElement('div');
  toggleButton.id = 'log-archive-ui-toggle-button';
  toggleButton.textContent = TOGGLE_BUTTON_ICON;
  document.body.appendChild(toggleButton);

  // --- 获取 DOM 引用 ---
  const uiContainer = document.getElementById('log-archive-ui-container');
  const logView = document.getElementById('log-archive-log-view');
  const configView = document.getElementById('log-archive-config-view');

  const channelSelector = document.getElementById('log-archive-channel-selector');
  const logDisplay = document.getElementById('log-archive-ui-log-display');
  const copyButton = document.getElementById('log-archive-copy-button');
  const closeButton = document.getElementById('log-archive-close-button');
  const refreshButton = document.getElementById('log-archive-refresh-button');
  const downloadButton = document.getElementById('log-archive-download-button');
  const statsButton = document.getElementById('log-archive-stats-button');
  const settingsButton = document.getElementById('log-archive-settings-button');
  const pauseButton = document.getElementById('log-archive-pause-button');
  
  // 配置页控件
  const selfNameInput = document.getElementById('log-archive-self-name-input');
  const pageSizeInput = document.getElementById('log-archive-page-size-input');
  const cleanButton = document.getElementById('log-archive-clean-button');
  const copyAllButton = document.getElementById('log-archive-copy-all-button');
  const clearButton = document.getElementById('log-archive-clear-button');

  // 分页控件
  const paginationControls = document.getElementById('log-archive-ui-pagination-controls');
  const pageFirstBtn = document.getElementById('page-first');
  const pagePrevBtn = document.getElementById('page-prev');
  const pageNextBtn = document.getElementById('page-next');
  const pageLastBtn = document.getElementById('page-last');
  const pageInfoSpan = document.getElementById('page-info');

  // --- 初始化值 ---
  selfNameInput.value = localStorage.getItem(SELF_NAME_KEY) || '';
  pageSizeInput.value = uiState.pageSize;

  // --- 辅助逻辑 ---
  const saveConfig = () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ pageSize: uiState.pageSize }));
  };

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

  // --- 渲染核心 ---
  function renderCurrentView() {
    const selectedChannel = channelSelector.value;
    const messages = inMemoryChatState[selectedChannel] || [];

    // 视图可见性切换
    logView.style.display = uiState.viewMode === 'config' ? 'none' : 'flex';
    configView.style.display = uiState.viewMode === 'config' ? 'flex' : 'none';
    
    // 按钮激活状态
    statsButton.classList.toggle('active', uiState.viewMode === 'stats');
    settingsButton.classList.toggle('active', uiState.viewMode === 'config');

    if (uiState.viewMode === 'config') {
      updateCleanButtonState(detectTotalDuplicates(inMemoryChatState));
      return;
    }

    if (uiState.viewMode === 'stats') {
      paginationControls.style.display = 'none';
      updateTextareaAndPreserveSelection(() => {
        logDisplay.value = generateStatisticsText(messages, selectedChannel);
      });
    } else {
      paginationControls.style.display = 'flex';
      uiState.totalPages = Math.max(1, Math.ceil(messages.length / uiState.pageSize));
      if (uiState.currentPage > uiState.totalPages) uiState.currentPage = uiState.totalPages;

      const startIndex = (uiState.currentPage - 1) * uiState.pageSize;
      const paginatedMessages = messages.slice(startIndex, startIndex + uiState.pageSize);

      updateTextareaAndPreserveSelection(() => {
        logDisplay.value = paginatedMessages.length > 0
          ? paginatedMessages.map(formatMessageForDisplay).join('\n')
          : `--- 在频道 [${selectedChannel}] 中没有记录 ---`;
      });
      
      pageInfoSpan.textContent = `${uiState.currentPage} / ${uiState.totalPages}`;
      const isFirst = uiState.currentPage === 1;
      const isLast = uiState.currentPage === uiState.totalPages;
      pageFirstBtn.disabled = pagePrevBtn.disabled = isFirst;
      pageNextBtn.disabled = pageLastBtn.disabled = isLast;
    }
  }

  function updateUI() {
    const prev = channelSelector.value;
    const channels = Object.keys(inMemoryChatState);
    channelSelector.innerHTML = '';
    
    if (channels.length === 0) {
      channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      channels.forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${inMemoryChatState[ch].length})`;
        channelSelector.appendChild(opt);
      });
      if (prev && channels.includes(prev)) {
        channelSelector.value = prev;
      }
    }
    renderCurrentView();
  }

  // --- 事件绑定 ---

  // 设置项变化
  selfNameInput.addEventListener('change', () => {
    localStorage.setItem(SELF_NAME_KEY, selfNameInput.value.trim());
  });

  pageSizeInput.addEventListener('change', () => {
    const val = parseInt(pageSizeInput.value, 10);
    if (!isNaN(val) && val >= 10) {
      uiState.pageSize = val;
      saveConfig();
      if (uiState.viewMode === 'log') renderCurrentView();
    }
  });

  // 顶栏视图切换
  settingsButton.addEventListener('click', () => {
    uiState.viewMode = uiState.viewMode === 'config' ? 'log' : 'config';
    renderCurrentView();
  });

  statsButton.addEventListener('click', () => {
    uiState.viewMode = uiState.viewMode === 'stats' ? 'log' : 'stats';
    renderCurrentView();
  });

  // 顶栏通用操作
  refreshButton.addEventListener('click', () => {
    scanAndMergeHistory();
    saveMessagesToStorage(inMemoryChatState);
    updateUI();
  });

  pauseButton.addEventListener('click', () => {
    isUIPaused = !isUIPaused;
    pauseButton.classList.toggle('paused', isUIPaused);
    pauseButton.textContent = isUIPaused ? '▶️ ' : '⏸️ ';
    if (!isUIPaused) updateUI();
  });

  channelSelector.addEventListener('change', () => {
    uiState.currentPage = 1;
    renderCurrentView();
  });

  // 日志文本框自动暂停
  logDisplay.addEventListener('mousedown', () => {
    if (!isUIPaused) {
      isUIPaused = true;
      pauseButton.textContent = '▶️ ';
      pauseButton.classList.add('paused');
    }
  });

  // 分页操作
  pageFirstBtn.addEventListener('click', () => { uiState.currentPage = 1; renderCurrentView(); });
  pagePrevBtn.addEventListener('click', () => { if (uiState.currentPage > 1) { uiState.currentPage--; renderCurrentView(); } });
  pageNextBtn.addEventListener('click', () => { if (uiState.currentPage < uiState.totalPages) { uiState.currentPage++; renderCurrentView(); } });
  pageLastBtn.addEventListener('click', () => { uiState.currentPage = uiState.totalPages; renderCurrentView(); });

  // 复制与下载
  copyButton.addEventListener('click', () => {
    if (logDisplay.value) {
      navigator.clipboard.writeText(logDisplay.value).then(() => {
        const originalText = copyButton.textContent;
        copyButton.textContent = '已复制!';
        setTimeout(() => { copyButton.textContent = originalText; }, 1500);
      });
    }
  });

  copyAllButton.addEventListener('click', () => {
    const messages = JSON.stringify(inMemoryChatState, null, 2);
    navigator.clipboard.writeText(messages).then(() => {
      const originalText = copyAllButton.textContent;
      copyAllButton.textContent = '已复制 JSON!';
      setTimeout(() => { copyAllButton.textContent = originalText; }, 1500);
    });
  });

  downloadButton.addEventListener('click', () => {
    if (Object.keys(inMemoryChatState).length === 0) return;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const baseFilename = `pt-saver-${timestamp}`;
    
    // 生成文本版本
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

    triggerDownload(JSON.stringify(inMemoryChatState, null, 2), `${baseFilename}.json`, 'application/json');
    triggerDownload(allTextContent.trim(), `${baseFilename}.txt`, 'text/plain');
  });

  // 维护操作
  cleanButton.addEventListener('click', () => {
    const duplicateCount = detectTotalDuplicates(inMemoryChatState);
    if (duplicateCount === 0) return alert('未发现可清理的重复记录。');
    if (confirm(`【确认】此操作将根据特定规则删除 ${duplicateCount} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`)) {
      for (const channel in inMemoryChatState) {
        const { cleanedRecords } = cleanChannelRecords(inMemoryChatState[channel]);
        inMemoryChatState[channel] = cleanedRecords;
      }
      saveMessagesToStorage(inMemoryChatState);
      updateUI();
      cleanButton.textContent = '清理完毕!';
      setTimeout(() => { updateCleanButtonState(0); }, 2000);
    }
  });

  clearButton.addEventListener('click', () => {
    if (confirm('【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？')) {
      deactivateLogger();
      localStorage.removeItem(STORAGE_KEY_V5);
      Object.keys(inMemoryChatState).forEach(key => delete inMemoryChatState[key]);
      scanAndMergeHistory();
      saveMessagesToStorage(inMemoryChatState);
      uiState.viewMode = 'log';
      updateUI();
    }
  });

  // UI 整体显隐控制
  toggleButton.addEventListener('click', () => {
    const isVisible = uiContainer.style.display === 'flex';
    if (!isVisible) updateUI();
    uiContainer.style.display = isVisible ? 'none' : 'flex';
  });
  closeButton.addEventListener('click', () => { uiContainer.style.display = 'none'; });

  // --- 返回控制句柄 ---
  return { 
    updateUI, 
    checkStorageUsage: () => {
      const usageMB = getStorageUsageInMB();
      const uiHeader = document.getElementById('log-archive-ui-header');
      let warningElement = document.getElementById('log-archive-storage-warning');
      if (usageMB > 3.5) {
        if (!warningElement) {
          warningElement = document.createElement('div');
          warningElement.id = 'log-archive-storage-warning';
          uiHeader.insertBefore(warningElement, document.getElementById('log-archive-ui-controls'));
        }
        warningElement.textContent = `⚠️ 存储占用过高 (${usageMB.toFixed(1)}MB)，请及时清理！`;
      } else if (warningElement) {
        warningElement.remove();
      }
    }, 
    isUIPaused: () => isUIPaused 
  };
}
~~~~~

### 下一步建议

1.  **验证分页**: 调整 `pageSize` 后，确认 `log-view` 能够正确响应并更新分页信息。
2.  **验证持久化**: 刷新页面，确认修改后的分页大小依然生效。
3.  **提交变更**: 在确认功能符合预期后，建议进行 Git 提交。
