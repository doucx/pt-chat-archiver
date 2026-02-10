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
    viewingServer: null, // 当前 UI 查看的服务器
    activeServer: null,  // 当前物理检测到的服务器
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
  const serverViewSelector = document.getElementById('log-archive-server-view-selector');
  const logDisplay = document.getElementById('log-archive-ui-log-display');
  const copyButton = document.getElementById('log-archive-copy-button');
  const closeButton = document.getElementById('log-archive-close-button');
  const downloadButton = document.getElementById('log-archive-download-button');
  const statsButton = document.getElementById('log-archive-stats-button');
  const settingsButton = document.getElementById('log-archive-settings-button');
  const pauseButton = document.getElementById('log-archive-pause-button');

  // 配置页控件
  const selfNameInput = document.getElementById('log-archive-self-name-input');
  const pageSizeInput = document.getElementById('log-archive-page-size-input');
  const configStorageInfo = document.getElementById('log-archive-config-storage-info');
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
    let selectionStart;
    let selectionEnd;
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
    // 确保 viewingServer 有值，默认为 activeServer，再没有就取第一个
    if (!uiState.viewingServer) {
        uiState.viewingServer = uiState.activeServer || Object.keys(inMemoryChatState)[0];
    }
    
    const viewingData = inMemoryChatState[uiState.viewingServer] || {};
    const selectedChannel = channelSelector.value;
    const messages = viewingData[selectedChannel] || [];

    // 更新只读状态提示
    const statusElement = document.getElementById('log-archive-server-status');
    if (statusElement) {
        if (uiState.activeServer && uiState.viewingServer !== uiState.activeServer) {
            statusElement.textContent = `⚠️ 正在查看 [${uiState.viewingServer}] (只读)`;
            statusElement.style.color = 'var(--color-warning)';
        } else if (uiState.activeServer) {
            statusElement.textContent = `✅ 正在记录 [${uiState.activeServer}]`;
            statusElement.style.color = 'var(--color-primary-hover)';
        } else {
             statusElement.textContent = '等待进入游戏...';
             statusElement.style.color = 'var(--color-text-dim)';
        }
    }

    // 视图可见性切换
    logView.style.display = uiState.viewMode === 'config' ? 'none' : 'flex';
    configView.style.display = uiState.viewMode === 'config' ? 'flex' : 'none';

    // 按钮激活状态与文本切换
    const isStatsMode = uiState.viewMode === 'stats';
    const isConfigMode = uiState.viewMode === 'config';

    statsButton.classList.toggle('active', isStatsMode);
    statsButton.textContent = isStatsMode ? '📜 记录' : '📊 统计';

    settingsButton.classList.toggle('active', isConfigMode);

    if (isConfigMode) {
      const usageMB = getStorageUsageInMB();
      configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;
      updateCleanButtonState(detectTotalDuplicates(inMemoryChatState));
      return;
    }

    if (isStatsMode) {
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
        logDisplay.value =
          paginatedMessages.length > 0
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
    // 1. 更新服务器选择器 (Settings)
    const allServers = Object.keys(inMemoryChatState);
    if (uiState.activeServer && !allServers.includes(uiState.activeServer)) {
        allServers.push(uiState.activeServer);
    }
    // 简单的去重
    const uniqueServers = [...new Set(allServers)].sort();
    
    const prevServer = serverViewSelector.value;
    serverViewSelector.innerHTML = '';
    for (const srv of uniqueServers) {
        const opt = document.createElement('option');
        opt.value = srv;
        opt.textContent = srv + (srv === uiState.activeServer ? ' (当前)' : '');
        serverViewSelector.appendChild(opt);
    }
    if (prevServer && uniqueServers.includes(prevServer)) {
        serverViewSelector.value = prevServer;
    } else if (uiState.viewingServer) {
        serverViewSelector.value = uiState.viewingServer;
    }

    // 2. 更新频道选择器 (Main) - 基于 viewingServer
    const viewingData = inMemoryChatState[uiState.viewingServer] || {};
    const channels = Object.keys(viewingData);
    const prevChannel = channelSelector.value;
    channelSelector.innerHTML = '';

    if (channels.length === 0) {
      channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${viewingData[ch].length})`;
        channelSelector.appendChild(opt);
      }
      if (prevChannel && channels.includes(prevChannel)) {
        channelSelector.value = prevChannel;
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
    const val = Number.parseInt(pageSizeInput.value, 10);
    if (!Number.isNaN(val) && val >= 10) {
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
  pauseButton.addEventListener('click', () => {
    isUIPaused = !isUIPaused;
    pauseButton.classList.toggle('paused', isUIPaused);
    pauseButton.textContent = isUIPaused ? '▶️ ' : '⏸️ ';
    if (!isUIPaused) updateUI();
  });
  
  // 服务器切换
  serverViewSelector.addEventListener('change', () => {
      uiState.viewingServer = serverViewSelector.value;
      uiState.currentPage = 1;
      updateUI();
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
  pageFirstBtn.addEventListener('click', () => {
    uiState.currentPage = 1;
    renderCurrentView();
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
    uiState.currentPage = uiState.totalPages;
    renderCurrentView();
  });

  // 复制与下载
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
    const messages = JSON.stringify(inMemoryChatState, null, 2);
    navigator.clipboard.writeText(messages).then(() => {
      const originalText = copyAllButton.textContent;
      copyAllButton.textContent = '已复制 JSON!';
      setTimeout(() => {
        copyAllButton.textContent = originalText;
      }, 1500);
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

    triggerDownload(
      JSON.stringify(inMemoryChatState, null, 2),
      `${baseFilename}.json`,
      'application/json',
    );
    triggerDownload(allTextContent.trim(), `${baseFilename}.txt`, 'text/plain');
  });

  // 维护操作
  cleanButton.addEventListener('click', () => {
    const viewingData = inMemoryChatState[uiState.viewingServer];
    if (!viewingData) return;
    
    const duplicateCount = detectTotalDuplicates(viewingData);
    if (duplicateCount === 0) return alert('在当前查看的服务器中未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将清理 [${uiState.viewingServer}] 中的 ${duplicateCount} 条重复记录。确定要继续吗？`,
      )
    ) {
      for (const channel in viewingData) {
        const { cleanedRecords } = cleanChannelRecords(viewingData[channel]);
        viewingData[channel] = cleanedRecords;
      }
      saveMessagesToStorage(inMemoryChatState);
      updateUI();
      cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        updateCleanButtonState(0);
      }, 2000);
    }
  });

  clearButton.addEventListener('click', () => {
    if (
      confirm(
        '【严重警告】此操作将清空【所有服务器】的本地存档！确定要执行吗？',
      )
    ) {
      deactivateLogger();
      localStorage.removeItem(STORAGE_KEY_V5); // Clean legacy just in case
      // Reset everything
      for (const key of Object.keys(inMemoryChatState)) {
        delete inMemoryChatState[key];
      }
      scanAndMergeHistory(); // This will re-populate current server from DOM
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
  closeButton.addEventListener('click', () => {
    uiContainer.style.display = 'none';
  });

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
    isUIPaused: () => isUIPaused,
    updateServerDisplay: (serverName) => {
      uiState.activeServer = serverName;
      // 首次检测到服务器时，如果用户没手动选过，自动切过去
      if (!uiState.viewingServer) {
        uiState.viewingServer = serverName;
      }
      updateUI(); // 重新渲染状态栏和可能的选择器更新
    },
  };
}
