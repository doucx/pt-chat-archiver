import { generateStatisticsText } from './analysis.js';
import { SELF_NAME_KEY, STORAGE_KEY_V5 } from './constants.js';
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

export function createUI(inMemoryChatState, callbacks) {
  const {
    scanAndMergeHistory,
    saveMessagesToStorage,
    cleanChannelRecords,
    detectTotalDuplicates,
    deactivateLogger,
  } = callbacks;

  const uiState = {
    currentPage: 1,
    pageSize: 1000,
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
  // Pagination elements
  const paginationControls = document.getElementById('log-archive-ui-pagination-controls');
  const pageFirstBtn = document.getElementById('page-first');
  const pagePrevBtn = document.getElementById('page-prev');
  const pageNextBtn = document.getElementById('page-next');
  const pageLastBtn = document.getElementById('page-last');
  const pageInfoSpan = document.getElementById('page-info');

  selfNameInput.value = localStorage.getItem(SELF_NAME_KEY) || '';
  selfNameInput.addEventListener('change', () => {
    localStorage.setItem(SELF_NAME_KEY, selfNameInput.value.trim());
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
