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