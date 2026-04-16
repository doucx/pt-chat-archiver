import { generateStatisticsText } from '../analysis.js';
import { MigrationManager } from '../migrations.js';
import { getStorageUsageInMB, storageManager } from '../storage/index.js';
import { formatISOTimeForDisplay } from '../utils.js';

/**
 * Formats a single message object into a display string for the UI or text export.
 * @param {object} msg - The message object.
 * @returns {string} Formatted string.
 */
export function formatMessageForDisplay(msg) {
  let prefix = '';
  const type = msg.type || '';
  if (type.includes('party')) prefix = '👥 ';
  else if (type.includes('whisper')) prefix = '💬 ';
  else if (type.includes('announcement')) prefix = '📣 ';
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

  // --- Main Render Logic ---
  /**
   * RenderContext 结构:
   * {
   *   serverList: string[],
   *   channelList: string[], (当前服务器的频道列表)
   *   channelCounts: Object, (频道名 -> 消息数)
   *   messages: Message[], (当前页的消息)
   *   totalCount: number, (当前频道的总消息数)
   * }
   */
  const render = (context, callbacks) => {
    const {
      viewMode,
      currentPage,
      totalPages,
      viewingServer,
      activeServer,
      recordedChannel,
      isLockedToBottom,
    } = uiState.getState();
    const { serverList, channelList, channelCounts, messages, selectedChannel } = context;

    // 1. 更新服务器选择器
    if (dom.serverViewSelector) {
      const prevServer = dom.serverViewSelector.value;
      dom.serverViewSelector.innerHTML = '';
      if (serverList.length === 0) {
        dom.serverViewSelector.innerHTML = '<option value="">无存档</option>';
      } else {
        for (const s of serverList) {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s === activeServer ? `${s} (正在记录)` : s;
          dom.serverViewSelector.appendChild(opt);
        }
        // 优先保持当前选择，或者是 UI State 认为应该显示的，或者默认第一个
        dom.serverViewSelector.value = viewingServer || prevServer || serverList[0] || '';
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
        const lastSrv = uiState.getState().lastServer;
        dom.serverStatus.textContent = lastSrv
          ? `等待进入游戏... (上一个服务器: ${lastSrv})`
          : '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (!isReadOnly) {
        if (recordedChannel) {
          dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}::${recordedChannel}`;
        } else {
          dom.serverStatus.textContent = `✅ 已检测到: ${activeServer}`;
        }
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else {
        dom.serverStatus.textContent = `📖 浏览存档: ${viewingServer}`;
        dom.serverStatus.style.color = 'var(--color-text-dim)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = false;
      }
    }

    // 3. 更新频道选择器
    dom.channelSelector.innerHTML = '';
    if (channelList.length === 0) {
      dom.channelSelector.innerHTML = '<option value="">无记录</option>';
    } else {
      for (const ch of channelList) {
        const opt = document.createElement('option');
        opt.value = ch;
        const count = channelCounts[ch] || 0;
        opt.textContent = `${ch} (${count})`;
        dom.channelSelector.appendChild(opt);
      }
      // 直接应用 context 中计算好的选中频道
      if (selectedChannel) {
        dom.channelSelector.value = selectedChannel;
      }
    }

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

      // 检查是否有旧版残留数据
      const legacy = MigrationManager.scanForLegacyData();
      if (legacy.v4 || legacy.v5 || legacy.v6) {
        dom.legacyRecoveryGroup.style.display = 'block';
        const versions = [];
        if (legacy.v4) versions.push('v4');
        if (legacy.v5) versions.push('v5');
        if (legacy.v6) versions.push('v6');
        dom.legacyInfoText.textContent = `检测到旧版本 (${versions.join('/')}) 的残留数据。`;
      } else {
        dom.legacyRecoveryGroup.style.display = 'none';
      }

      // 检查是否有备份
      if (storageManager.hasV6Backup()) {
        dom.deleteBackupGroup.style.display = 'flex';
      } else {
        dom.deleteBackupGroup.style.display = 'none';
      }

      return;
    }

    if (viewMode === 'stats') {
      dom.paginationControls.style.display = 'none';
      updateTextareaAndPreserveSelection(() => {
        // 统计模式需要全量数据，这里 messages 只是当前页。
        // 如果需要全量统计，Renderer 需要知道这里的数据不全。
        // 暂时假设 messages 在 stats 模式下上层会传递全量 (Phase 1 特性)
        // 或者 Stats 功能在 Phase 4 才完全重构。
        // 为了兼容 Phase 1，上层在 stats 模式下应传递所有消息
        dom.logDisplay.value = generateStatisticsText(messages, selectedChannel);
      });
    } else {
      // 'log' view
      dom.paginationControls.style.display = 'flex';

      // 分页计算逻辑已移出 Renderer，直接使用 UI State 中的 totalPages

      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value =
          messages.length > 0
            ? messages.map(formatMessageForDisplay).join('\n')
            : `--- 在频道 [${selectedChannel}] 中没有记录 ---`;
      });

      // 如果处于吸附模式，确保滚动到底部
      if (isLockedToBottom && currentPage === totalPages) {
        dom.logDisplay.scrollTop = dom.logDisplay.scrollHeight;
      }

      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = isLast;

      // 状态反馈：锁定模式下按钮变绿
      dom.pageLastBtn.classList.toggle('active', isLockedToBottom);
      dom.pageLastBtn.disabled = isLast && isLockedToBottom;
    }
  };

  return {
    render,
    /**
     * 更新并显示进度条
     */
    updateProgress: (current, total, label) => {
      dom.progressOverlay.style.display = 'flex';
      const percent = total > 0 ? Math.min(100, (current / total) * 100) : 0;
      dom.progressBar.style.width = `${percent}%`;
      dom.progressStats.textContent = `${current} / ${total}`;
      if (label) dom.progressLabel.textContent = label;
    },
    /**
     * 隐藏进度条
     */
    hideProgress: () => {
      dom.progressOverlay.style.display = 'none';
      dom.progressBar.style.width = '0%';
    },
    checkStorageUsage: async () => {
      // IndexedDB 时代不再需要硬性的容量警告，此处改为静默。
      // 将来如果需要，可以实现基于浏览器 Quota 的警告。
    },
  };
}
