import { UI_FEEDBACK_DURATION } from '../constants.js';

/**
 * Binds all UI event listeners.
 * @param {object} params - An object containing dependencies.
 * @param {object} params.dom - The DOM elements object.
 * @param {object} params.uiState - The UI state manager.
 * @param {object} params.renderer - The renderer instance.
 * @param {object} params.getAppState - A function to get the current application state.
 * @param {object} params.callbacks - The callbacks object for app-level actions.
 */
export async function bindUIEvents({ dom, uiState, refreshView, callbacks }) {
  // refreshView 已经被绑定了 DataAdapter，调用它会触发 fetch -> render 流程
  const triggerRefresh = () => refreshView();

  // --- Main UI controls ---
  dom.toggleButton.addEventListener('click', () => {
    const isVisible = dom.uiContainer.style.display === 'flex';
    if (!isVisible) triggerRefresh();
    dom.uiContainer.style.display = isVisible ? 'none' : 'flex';
  });

  dom.closeButton.addEventListener('click', () => {
    dom.uiContainer.style.display = 'none';
  });

  dom.pauseButton.addEventListener('click', () => {
    const isPaused = uiState.togglePause();
    dom.pauseButton.classList.toggle('paused', isPaused);
    dom.pauseButton.textContent = isPaused ? '▶️ ' : '⏸️ ';
    if (!isPaused) triggerRefresh();
  });

  dom.channelSelector.addEventListener('change', () => {
    uiState.setSelectedChannel(dom.channelSelector.value);
    uiState.setPage(1);
    triggerRefresh();
  });

  dom.serverViewSelector.addEventListener('change', () => {
    uiState.setViewingServer(dom.serverViewSelector.value);
    uiState.setPage(1);
    triggerRefresh();
  });

  const handleResetServer = () => {
    const { activeServer } = uiState.getState();
    if (activeServer) {
      uiState.setViewingServer(activeServer);
      uiState.setPage(1);
      triggerRefresh();
    }
  };

  dom.resetServerButton.addEventListener('click', handleResetServer);
  dom.mainResetButton.addEventListener('click', handleResetServer);

  // --- View switching ---
  dom.settingsButton.addEventListener('click', () => {
    const currentMode = uiState.getState().viewMode;
    uiState.setViewMode(currentMode === 'config' ? 'log' : 'config');
    triggerRefresh();
  });

  dom.statsButton.addEventListener('click', () => {
    const currentMode = uiState.getState().viewMode;
    uiState.setViewMode(currentMode === 'stats' ? 'log' : 'stats');
    triggerRefresh();
  });

  // --- Log display interaction ---
  dom.logDisplay.addEventListener('mousedown', () => {
    if (!uiState.getState().isUIPaused) {
      uiState.forcePause(true);
      dom.pauseButton.textContent = '▶️ ';
      dom.pauseButton.classList.add('paused');
    }
  });

  // 处理滚动时的自动吸附与解锁逻辑
  dom.logDisplay.addEventListener('scroll', () => {
    const { isLockedToBottom, currentPage, totalPages } = uiState.getState();
    const threshold = 10; // 容差像素
    const isAtBottom =
      dom.logDisplay.scrollHeight - dom.logDisplay.scrollTop - dom.logDisplay.clientHeight <
      threshold;

    if (isLockedToBottom) {
      // 1. 已锁定状态下，向上滑动则解锁
      if (!isAtBottom) {
        uiState.setLockedToBottom(false);
        triggerRefresh();
      }
    } else {
      // 2. 未锁定状态下，如果在最后一页手动滑到底部，则自动加锁
      if (isAtBottom && currentPage === totalPages) {
        uiState.setLockedToBottom(true);
        triggerRefresh();
      }
    }
  });

  // --- Pagination ---
  dom.pageFirstBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(1);
    triggerRefresh();
  });
  dom.pagePrevBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(uiState.getState().currentPage - 1);
    triggerRefresh();
  });
  dom.pageNextBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(uiState.getState().currentPage + 1);
    triggerRefresh();
  });
  dom.pageLastBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().totalPages);
    uiState.setLockedToBottom(true);
    triggerRefresh();
  });

  // --- Config view actions ---
  dom.selfNameInput.addEventListener('change', async () => {
    await uiState.setSelfName(dom.selfNameInput.value);
  });
  dom.pageSizeInput.addEventListener('change', async () => {
    await uiState.setPageSize(dom.pageSizeInput.value);
    triggerRefresh();
  });

  dom.autoFollowInput.addEventListener('change', async () => {
    await uiState.setAutoFollowServer(dom.autoFollowInput.checked);
    triggerRefresh();
  });

  let pendingDuplicateIds = null;
  dom.cleanButton.addEventListener('click', async () => {
    if (pendingDuplicateIds === null) {
      // 当前是“扫描”状态
      dom.cleanButton.textContent = '扫描中...';
      dom.cleanButton.disabled = true;
      try {
        const ids = await callbacks.scanDuplicates();
        if (ids.length === 0) {
          dom.cleanButton.textContent = '未发现重复';
          setTimeout(() => {
            dom.cleanButton.textContent = '扫描重复记录';
          }, UI_FEEDBACK_DURATION);
        } else {
          pendingDuplicateIds = ids;
          dom.cleanButton.textContent = `清理重复 (${ids.length})`;
          dom.cleanButton.classList.add('active');
        }
      } finally {
        dom.cleanButton.disabled = false;
      }
    } else {
      // 当前是“清理”状态
      if (
        confirm(
          `【确认】将删除 ${pendingDuplicateIds.length} 条重复记录。此操作不可逆。确定要继续吗？`,
        )
      ) {
        dom.cleanButton.textContent = '清理中...';
        dom.cleanButton.disabled = true;
        try {
          await callbacks.deleteMessages(pendingDuplicateIds);
          pendingDuplicateIds = null;
          dom.cleanButton.textContent = '清理完毕!';
          dom.cleanButton.classList.remove('active');
          setTimeout(() => {
            dom.cleanButton.textContent = '扫描重复记录';
            triggerRefresh();
          }, UI_FEEDBACK_DURATION);
        } finally {
          dom.cleanButton.disabled = false;
        }
      }
    }
  });

  dom.clearButton.addEventListener('click', async () => {
    await callbacks.clearAllData();
    uiState.setViewMode('log');
    triggerRefresh();
  });

  dom.deleteBackupButton.addEventListener('click', async () => {
    if (
      confirm('【确认】将永久删除 LocalStorage 中的旧版备份数据。此操作不可撤销，确定要继续吗？')
    ) {
      await callbacks.deleteV6Backup();
      triggerRefresh();
    }
  });

  dom.recoverButton.addEventListener('click', async () => {
    const { viewingServer } = uiState.getState();
    const confirmMsg = `【数据恢复】此操作将尝试从 localStorage 提取旧数据并合并到当前数据库。

- v6 数据将按服务器自动归类。
- v4/v5 数据将合并到您当前查看的服务器: [${viewingServer}]。

建议在此操作前先“下载备份”以防万一。是否继续？`;

    if (confirm(confirmMsg)) {
      await callbacks.recoverLegacyData(viewingServer);
      triggerRefresh();
    }
  });

  dom.ignoreLegacyButton.addEventListener('click', async () => {
    if (
      confirm(
        '【严重警告】此操作将永久删除 localStorage 中的旧版聊天记录残留。此操作不可撤销，确定要清理吗？',
      )
    ) {
      await callbacks.clearLegacyData();
      triggerRefresh();
    }
  });

  // --- Data export ---
  dom.copyButton.addEventListener('click', () => {
    if (dom.logDisplay.value) {
      navigator.clipboard.writeText(dom.logDisplay.value).then(() => {
        const originalText = dom.copyButton.textContent;
        dom.copyButton.textContent = '✅';
        setTimeout(() => {
          dom.copyButton.textContent = originalText;
        }, UI_FEEDBACK_DURATION);
      });
    }
  });

  dom.copyJsonButton.addEventListener('click', () => {
    callbacks.copyJSON();
    const originalText = dom.copyJsonButton.textContent;
    dom.copyJsonButton.textContent = '✅ 已复制 JSON';
    setTimeout(() => {
      dom.copyJsonButton.textContent = originalText;
    }, UI_FEEDBACK_DURATION);
  });

  dom.copyTxtButton.addEventListener('click', () => {
    callbacks.copyTXT();
    const originalText = dom.copyTxtButton.textContent;
    dom.copyTxtButton.textContent = '✅ 已复制 TXT';
    setTimeout(() => {
      dom.copyTxtButton.textContent = originalText;
    }, UI_FEEDBACK_DURATION);
  });

  dom.downloadJsonButton.addEventListener('click', () => {
    callbacks.downloadJSON();
  });

  dom.downloadTxtButton.addEventListener('click', () => {
    callbacks.downloadTXT();
  });

  dom.importButton.addEventListener('click', () => {
    callbacks.importAllData();
  });

  // --- Initial value setup ---
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.autoFollowInput.checked = uiState.getState().autoFollowServer;
}
