import { generateStatisticsText } from '../analysis.js';
import { storageManager } from '../storage/index.js';
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
    const { viewMode, currentPage, pageSize, viewingServer, activeServer, isLockedToBottom } =
      uiState.getState();

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

    // 2. 状态判断与 UI 反馈
    const isReadOnly = viewingServer !== activeServer && activeServer !== null;
    dom.uiContainer.classList.toggle('is-readonly', isReadOnly);

    if (dom.readOnlyIndicator) dom.readOnlyIndicator.style.display = isReadOnly ? 'block' : 'none';
    if (dom.mainResetButton) dom.mainResetButton.style.display = isReadOnly ? 'block' : 'none';
    if (dom.pauseButton) dom.pauseButton.style.display = isReadOnly ? 'none' : 'block';

    if (dom.serverStatus) {
      if (!activeServer) {
        dom.serverStatus.textContent = '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (!isReadOnly) {
        dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}`;
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else {
        dom.serverStatus.textContent = `📖 浏览存档: ${viewingServer}`;
        dom.serverStatus.style.color = 'var(--color-text-dim)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = false;
      }
    }

    // 3. 获取当前服务器数据并更新频道选择器
    const serverData = appState[viewingServer] || {};
    const channels = Object.keys(serverData);
    const prevChannelValue = dom.channelSelector.value;

    dom.channelSelector.innerHTML = '';
    if (channels.length === 0) {
      dom.channelSelector.innerHTML = '<option value="">无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${serverData[ch].length})`;
        dom.channelSelector.appendChild(opt);
      }
      // 尝试恢复之前的选择，或者默认选择第一个可用频道
      if (prevChannelValue && channels.includes(prevChannelValue)) {
        dom.channelSelector.value = prevChannelValue;
      } else if (channels.length > 0) {
        dom.channelSelector.value = channels[0];
      }
    }

    // 4. 现在可以安全地获取选中频道的消息了
    const selectedChannel = dom.channelSelector.value;
    const messages = serverData[selectedChannel] || [];

    // Toggle view visibility
    dom.logView.style.display = viewMode === 'config' ? 'none' : 'flex';
    dom.configView.style.display = viewMode === 'config' ? 'flex' : 'none';

    // Update button states
    dom.statsButton.classList.toggle('active', viewMode === 'stats');
    dom.statsButton.textContent = viewMode === 'stats' ? '📜' : '📊';
    dom.settingsButton.classList.toggle('active', viewMode === 'config');

    if (viewMode === 'config') {
      // 异步更新存储信息，不阻塞渲染
      getStorageUsageInMB().then((usageMB) => {
        dom.configStorageInfo.textContent = `估算数据占用: ${usageMB.toFixed(2)} MB`;
      });

      storageManager.getTotalMessageCount().then((count) => {
        dom.configMsgCount.textContent = `存档消息总数: ${count.toLocaleString()} 条`;
      });

      // 检查是否有备份
      if (storageManager.hasV6Backup()) {
        dom.deleteBackupGroup.style.display = 'flex';
      } else {
        dom.deleteBackupGroup.style.display = 'none';
      }

      const { lastSavedTime } = uiState.getState();
      if (lastSavedTime) {
        dom.lastSavedInfo.textContent = `上次保存: ${formatISOTimeForDisplay(lastSavedTime).split(' ')[1]}`;
      } else {
        dom.lastSavedInfo.textContent = '尚未保存';
      }

      // 计算所有服务器的重复项总数
      let totalDuplicates = 0;
      for (const server in appState) {
        totalDuplicates += callbacks.detectTotalDuplicates(appState[server]);
      }
      updateCleanButtonState(totalDuplicates);
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
      const { totalPages } = uiState.getState();

      // 自动翻页逻辑：如果吸附到底部，强制同步到最后一页
      if (isLockedToBottom) {
        uiState.setPage(totalPages);
      } else if (currentPage > totalPages) {
        uiState.setPage(totalPages);
      }

      // 重新获取最新的状态值进行渲染
      const activeState = uiState.getState();
      const activePage = activeState.currentPage;

      const startIndex = (activePage - 1) * pageSize;
      const paginatedMessages = messages.slice(startIndex, startIndex + pageSize);

      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value =
          paginatedMessages.length > 0
            ? paginatedMessages.map(formatMessageForDisplay).join('\n')
            : `--- 在频道 [${selectedChannel}] 中没有记录 ---`;
      });

      // 如果处于吸附模式，确保滚动到底部
      if (isLockedToBottom && activePage === totalPages) {
        dom.logDisplay.scrollTop = dom.logDisplay.scrollHeight;
      }

      dom.pageInfoSpan.textContent = `${activePage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = isLast;

      // 状态反馈：锁定模式下按钮变绿
      dom.pageLastBtn.classList.toggle('active', isLockedToBottom);

      // 最后一页按钮仅在“已处于吸附模式”且“已经在最后一页”时才禁用
      dom.pageLastBtn.disabled = isLast && isLockedToBottom;
    }
  };

  return {
    render,
    checkStorageUsage: async () => {
      // IndexedDB 时代不再需要硬性的容量警告，此处改为静默。
      // 将来如果需要，可以实现基于浏览器 Quota 的警告。
    },
  };
}
