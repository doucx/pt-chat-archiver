import { generateStatisticsText } from '../analysis.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from '../utils.js';

/**
 * Formats a single message object into a display string for the UI or text export.
 * @param {object} msg - The message object.
 * @returns {string} Formatted string.
 */
export function formatMessageForDisplay(msg) {
  let prefix = '';
  if (msg.type.includes('party')) prefix = '👥 ';
  else if (msg.type.includes('whisper')) prefix = '💬 ';
  else if (msg.type.includes('announcement')) prefix = '📣 ';
  const displayTime = formatISOTimeForDisplay(msg.time);
  return `${displayTime} ${prefix}${msg.content}`;
}

/**
 * Creates a renderer instance responsible for updating the UI DOM.
 * @param {object} dom - The DOM elements object from dom.js.
 * @param {object} uiState - The UI state manager from state.js.
 * @returns {object} A renderer instance.
 */
export function createRenderer(dom, uiState) {
  // --- Private Helper Functions ---
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
    const { viewMode, currentPage, pageSize, viewingServer, activeServer } = uiState.getState();

    // 1. 更新服务器选择器 (v6 特有)
    const servers = Object.keys(appState);
    if (dom.serverViewSelector) {
      const prevServer = dom.serverViewSelector.value;
      dom.serverViewSelector.innerHTML = '';
      if (servers.length === 0) {
        dom.serverViewSelector.innerHTML = '<option value="">无存档</option>';
      } else {
        for (const s of servers) {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s === activeServer ? `${s} (正在记录)` : s;
          dom.serverViewSelector.appendChild(opt);
        }
        dom.serverViewSelector.value = viewingServer || prevServer || servers[0] || '';
      }
    }

    // 2. 更新服务器状态显示
    if (dom.serverStatus) {
      if (!activeServer) {
        dom.serverStatus.textContent = '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (viewingServer === activeServer) {
        dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}`;
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else {
        dom.serverStatus.textContent = `⚠️ 只读模式: 正在查看 ${viewingServer} 存档`;
        dom.serverStatus.style.color = 'var(--color-warning)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = false;
      }
    }
        dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}`;
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
      } else {
        dom.serverStatus.textContent = `⚠️ 只读模式: 正在查看 ${viewingServer} 存档`;
        dom.serverStatus.style.color = 'var(--color-warning)';
      }
    }

    // 3. 获取当前查看服务器的数据切片
    const serverData = appState[viewingServer] || {};
    const selectedChannel = dom.channelSelector.value;
    const messages = serverData[selectedChannel] || [];

    // 4. 更新频道选择器
    const channels = Object.keys(serverData);
    const prevChannelValue = dom.channelSelector.value;
    dom.channelSelector.innerHTML = '';
    if (channels.length === 0) {
      dom.channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${serverData[ch].length})`;
        dom.channelSelector.appendChild(opt);
      }
      if (channels.includes(prevChannelValue)) {
        dom.channelSelector.value = prevChannelValue;
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
