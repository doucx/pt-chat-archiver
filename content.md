你的分析非常准确。随着功能增加，顶栏按钮已经变得过于拥挤。引入一个专门的“配置/设置”页面不仅能满足你提到的三个需求，还能显著提升 UI 的整洁度。

我将执行以下操作：
1.  **在 `constants.js` 中增加配置存储键名**。
2.  **重构 `templates.js` 的 HTML 结构**，引入“视图切换”机制（记录视图 vs 设置视图），并增加设置页面的 HTML 模板。
3.  **更新 `style.css`**，为设置页面提供美观的表单布局。
4.  **重构 `ui.js`**，实现视图切换逻辑，处理分页大小的持久化，并将“清空”和“用户名”移动到设置视图。

---

## [WIP] feat: 引入设置页面并迁移相关配置项

### 用户需求
1.  添加配置页面用于管理全局设置。
2.  将“分页大小”、“清空按钮”、“用户名输入框”移动至配置页面。

### 评论
这是一个非常及时的重构。目前的 UI 顶栏已经承载了超过 10 个按钮，不仅在小屏幕上容易溢出，也增加了误操作（如误点清空）的风险。将管理类操作（配置、清理、清空）移入设置页面符合 TUI/GUI 的标准设计模式。

### 目标
1.  在 `constants.js` 中定义 `CONFIG_KEY`。
2.  在 `templates.js` 中重构 HTML，添加 `log-archive-config-view` 容器。
3.  在 `ui.js` 中实现 `pageSize` 的动态配置与持久化。
4.  实现设置页面的双向绑定（输入即保存）。

### 基本原理
通过在 `uiState` 中管理 `viewMode` (`'log'`, `'stats'`, `'config'`)，我们可以根据状态显示或隐藏对应的 DOM 容器。设置项（如分页大小）将存储在一个新的 JSON 对象中。为了保持兼容性，用户名仍保留在原有的 `SELF_NAME_KEY` 中，但在 UI 上统一展示。

### 标签
#intent/build #flow/ready #priority/high #comp/ui #concept/config #scope/ux #ai/delegate #task/domain/ui #task/object/settings-page #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 更新常量定义

添加配置信息的存储键。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
~~~~~
~~~~~javascript.new
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
export const CONFIG_KEY = 'chatLogArchive_config';
~~~~~

#### Acts 2: 更新样式

增加设置页面的表单样式。

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
  margin-top: 10px;
  padding-top: 20px;
  border-top: 1px solid #444;
  display: flex;
  gap: 15px;
}
#log-archive-ui-toggle-button {
~~~~~

#### Acts 3: 重构 UI 模板

重构主容器结构，将顶栏精简，并增加设置页面的 HTML 片段。

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

#### Acts 4: 重构 UI 逻辑

由于涉及到视图切换、新配置项的读写逻辑，我将重写 `ui.js` 以确保状态管理的一致性。

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

export function createUI(inMemoryChatState, callbacks) {
  const {
    scanAndMergeHistory,
    saveMessagesToStorage,
    cleanChannelRecords,
    detectTotalDuplicates,
    deactivateLogger,
  } = callbacks;

  // 加载配置
  const loadConfig = () => {
    const defaultCfg = { pageSize: 1000 };
    try {
      return { ...defaultCfg, ...JSON.parse(localStorage.getItem(CONFIG_KEY)) };
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

  // 初始化 DOM
  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
  container.innerHTML = getMainContainerHTML(__APP_VERSION__);
  document.body.appendChild(container);

  const toggleButton = document.createElement('div');
  toggleButton.id = 'log-archive-ui-toggle-button';
  toggleButton.textContent = TOGGLE_BUTTON_ICON;
  document.body.appendChild(toggleButton);

  // 绑定 DOM 引用
  const uiContainer = document.getElementById('log-archive-ui-container');
  const logView = document.getElementById('log-archive-log-view');
  const configView = document.getElementById('log-archive-config-view');
  
  const channelSelector = document.getElementById('log-archive-channel-selector');
  const logDisplay = document.getElementById('log-archive-ui-log-display');
  
  const refreshButton = document.getElementById('log-archive-refresh-button');
  const pauseButton = document.getElementById('log-archive-pause-button');
  const statsButton = document.getElementById('log-archive-stats-button');
  const settingsButton = document.getElementById('log-archive-settings-button');
  
  const copyButton = document.getElementById('log-archive-copy-button');
  const downloadButton = document.getElementById('log-archive-download-button');
  const closeButton = document.getElementById('log-archive-close-button');

  // 配置页组件
  const selfNameInput = document.getElementById('log-archive-self-name-input');
  const pageSizeInput = document.getElementById('log-archive-page-size-input');
  const cleanButton = document.getElementById('log-archive-clean-button');
  const copyAllButton = document.getElementById('log-archive-copy-all-button');
  const clearButton = document.getElementById('log-archive-clear-button');

  // 分页组件
  const paginationControls = document.getElementById('log-archive-ui-pagination-controls');
  const pageFirstBtn = document.getElementById('page-first');
  const pagePrevBtn = document.getElementById('page-prev');
  const pageNextBtn = document.getElementById('page-next');
  const pageLastBtn = document.getElementById('page-last');
  const pageInfoSpan = document.getElementById('page-info');

  // --- 初始化配置值 ---
  selfNameInput.value = localStorage.getItem(SELF_NAME_KEY) || '';
  pageSizeInput.value = uiState.pageSize;

  // --- 辅助函数 ---
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

  // --- 核心渲染逻辑 ---
  function renderCurrentView() {
    const selectedChannel = channelSelector.value;
    const messages = inMemoryChatState[selectedChannel] || [];

    // 处理视图可见性
    logView.style.display = uiState.viewMode === 'config' ? 'none' : 'flex';
    configView.style.display = uiState.viewMode === 'config' ? 'flex' : 'none';
    
    // 更新按钮状态
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
      pageFirstBtn.disabled = pagePrevBtn.disabled = uiState.currentPage === 1;
      pageNextBtn.disabled = pageLastBtn.disabled = uiState.currentPage === uiState.totalPages;
    }
  }

  function updateUI() {
    const prev = channelSelector.value;
    const channels = Object.keys(inMemoryChatState);
    channelSelector.innerHTML = channels.length ? '' : '<option>无记录</option>';
    channels.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = `${ch} (${inMemoryChatState[ch].length})`;
      channelSelector.appendChild(opt);
    });
    if (prev && channels.includes(prev)) channelSelector.value = prev;
    renderCurrentView();
  }

  // --- 事件绑定 ---

  // 设置页绑定
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

  cleanButton.addEventListener('click', () => {
    const count = detectTotalDuplicates(inMemoryChatState);
    if (count === 0) return alert('未发现可清理的重复记录。');
    if (confirm(`确定要删除 ${count} 条被识别为错误导入的记录吗？此操作不可逆。`)) {
      for (const ch in inMemoryChatState) {
        const { cleanedRecords } = cleanChannelRecords(inMemoryChatState[ch]);
        inMemoryChatState[ch] = cleanedRecords;
      }
      saveMessagesToStorage(inMemoryChatState);
      updateUI();
    }
  });

  // 顶栏按钮
  settingsButton.addEventListener('click', () => {
    uiState.viewMode = uiState.viewMode === 'config' ? 'log' : 'config';
    renderCurrentView();
  });

  statsButton.addEventListener('click', () => {
    uiState.viewMode = uiState.viewMode === 'stats' ? 'log' : 'stats';
    renderCurrentView();
  });

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

  // 分页
  pageFirstBtn.addEventListener('click', () => { uiState.currentPage = 1; renderCurrentView(); });
  pagePrevBtn.addEventListener('click', () => { if (uiState.currentPage > 1) { uiState.currentPage--; renderCurrentView(); } });
  pageNextBtn.addEventListener('click', () => { if (uiState.currentPage < uiState.totalPages) { uiState.currentPage++; renderCurrentView(); } });
  pageLastBtn.addEventListener('click', () => { uiState.currentPage = uiState.totalPages; renderCurrentView(); });

  // 其他
  toggleButton.addEventListener('click', () => {
    const isVisible = uiContainer.style.display === 'flex';
    if (!isVisible) updateUI();
    uiContainer.style.display = isVisible ? 'none' : 'flex';
  });
  
  closeButton.addEventListener('click', () => { uiContainer.style.display = 'none'; });

  copyButton.addEventListener('click', () => {
    if (logDisplay.value) {
      navigator.clipboard.writeText(logDisplay.value).then(() => {
        const txt = copyButton.textContent;
        copyButton.textContent = '已复制!';
        setTimeout(() => copyButton.textContent = txt, 1500);
      });
    }
  });

  copyAllButton.addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(inMemoryChatState, null, 2)).then(() => {
      const txt = copyAllButton.textContent;
      copyAllButton.textContent = '已复制 JSON!';
      setTimeout(() => copyAllButton.textContent = txt, 1500);
    });
  });

  downloadButton.addEventListener('click', () => {
    if (Object.keys(inMemoryChatState).length === 0) return;
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const blob = new Blob([JSON.stringify(inMemoryChatState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pt-archive-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  clearButton.addEventListener('click', () => {
    if (confirm('【严重警告】此操作将永久删除所有本地聊天记录存档！确定要继续吗？')) {
      deactivateLogger();
      localStorage.removeItem(STORAGE_KEY_V5);
      Object.keys(inMemoryChatState).forEach(key => delete inMemoryChatState[key]);
      scanAndMergeHistory();
      saveMessagesToStorage(inMemoryChatState);
      uiState.viewMode = 'log';
      updateUI();
    }
  });

  return { 
    updateUI, 
    checkStorageUsage: () => {
      const mb = getStorageUsageInMB();
      let warn = document.getElementById('log-archive-storage-warning');
      if (mb > 3.5) {
        if (!warn) {
          warn = document.createElement('div');
          warn.id = 'log-archive-storage-warning';
          document.getElementById('log-archive-ui-header').insertBefore(warn, document.getElementById('log-archive-ui-controls'));
        }
        warn.textContent = `⚠️ 存储占用过高 (${mb.toFixed(1)}MB)`;
      } else if (warn) warn.remove();
    },
    isUIPaused: () => isUIPaused 
  };
}
~~~~~

---

### 下一步建议

我们已经成功实现了设置页面，并将管理类操作进行了逻辑归类。这使得 UI 更加专业且易于扩展。

接下来的建议：
- **引入外观主题配置**：在设置页面添加一个下拉框，允许用户在“深色/浅色/透明”等主题间切换。
- **配置导出/导入**：除了导出聊天记录，还可以考虑支持导出插件本身的配置，方便在多台设备间同步昵称等信息。
- **自动清理策略**：可以在设置中增加一个“自动清理”选项，例如“保留最近 30 天”或“当存储超过 4MB 时自动归档”。
