/**
 * Binds all UI event listeners.
 * @param {object} params - An object containing dependencies.
 * @param {object} params.dom - The DOM elements object.
 * @param {object} params.uiState - The UI state manager.
 * @param {object} params.renderer - The renderer instance.
 * @param {object} params.getAppState - A function to get the current application state.
 * @param {object} params.callbacks - The callbacks object for app-level actions.
 */
export async function bindUIEvents({ dom, uiState, renderer, getAppState, callbacks }) {
  const fullRender = () => renderer.render(getAppState(), callbacks);

  // --- Main UI controls ---
  dom.toggleButton.addEventListener('click', () => {
    const isVisible = dom.uiContainer.style.display === 'flex';
    if (!isVisible) fullRender();
    dom.uiContainer.style.display = isVisible ? 'none' : 'flex';
  });

  dom.closeButton.addEventListener('click', () => {
    dom.uiContainer.style.display = 'none';
  });

  dom.pauseButton.addEventListener('click', () => {
    const isPaused = uiState.togglePause();
    dom.pauseButton.classList.toggle('paused', isPaused);
    dom.pauseButton.textContent = isPaused ? '▶️ ' : '⏸️ ';
    if (!isPaused) fullRender();
  });

  dom.channelSelector.addEventListener('change', () => {
    uiState.setPage(1);
    fullRender();
  });

  dom.serverViewSelector.addEventListener('change', () => {
    uiState.setViewingServer(dom.serverViewSelector.value);
    uiState.setPage(1);
    fullRender();
  });

  const handleResetServer = () => {
    const { activeServer } = uiState.getState();
    if (activeServer) {
      uiState.setViewingServer(activeServer);
      uiState.setPage(1);
      fullRender();
    }
  };

  dom.resetServerButton.addEventListener('click', handleResetServer);
  dom.mainResetButton.addEventListener('click', handleResetServer);

  // --- View switching ---
  dom.settingsButton.addEventListener('click', () => {
    const currentMode = uiState.getState().viewMode;
    uiState.setViewMode(currentMode === 'config' ? 'log' : 'config');
    fullRender();
  });

  dom.statsButton.addEventListener('click', () => {
    const currentMode = uiState.getState().viewMode;
    uiState.setViewMode(currentMode === 'stats' ? 'log' : 'stats');
    fullRender();
  });

  // --- Log display interaction ---
  dom.logDisplay.addEventListener('mousedown', () => {
    if (!uiState.getState().isUIPaused) {
      uiState.forcePause(true);
      dom.pauseButton.textContent = '▶️ ';
      dom.pauseButton.classList.add('paused');
    }
  });

  // --- Pagination ---
  dom.pageFirstBtn.addEventListener('click', () => {
    uiState.setPage(1);
    fullRender();
  });
  dom.pagePrevBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().currentPage - 1);
    fullRender();
  });
  dom.pageNextBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().currentPage + 1);
    fullRender();
  });
  dom.pageLastBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().totalPages);
    fullRender();
  });

  // --- Config view actions ---
  dom.selfNameInput.addEventListener('change', async () => {
    await uiState.setSelfName(dom.selfNameInput.value);
  });
  dom.pageSizeInput.addEventListener('change', async () => {
    await uiState.setPageSize(dom.pageSizeInput.value);
    fullRender();
  });

  dom.autoSaveIntervalInput.addEventListener('change', async () => {
    await uiState.setAutoSaveInterval(dom.autoSaveIntervalInput.value);
    callbacks.onAutoSaveIntervalChange();
    fullRender();
  });

  dom.autoFollowInput.addEventListener('change', async () => {
    await uiState.setAutoFollowServer(dom.autoFollowInput.checked);
    fullRender();
  });

  dom.saveNowButton.addEventListener('click', async () => {
    await callbacks.manualSave();
    const originalText = dom.saveNowButton.textContent;
    dom.saveNowButton.textContent = '✅ 已保存';
    setTimeout(() => {
      dom.saveNowButton.textContent = originalText;
    }, 1500);
  });

  dom.cleanButton.addEventListener('click', async () => {
    await callbacks.cleanChannelRecords();
    fullRender(); // Re-render to update button state
  });

  dom.clearButton.addEventListener('click', async () => {
    await callbacks.clearAllData();
    uiState.setViewMode('log');
    fullRender();
  });

  dom.deleteBackupButton.addEventListener('click', async () => {
    if (
      confirm('【确认】将永久删除 LocalStorage 中的旧版备份数据。此操作不可撤销，确定要继续吗？')
    ) {
      await callbacks.deleteV6Backup();
      fullRender();
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
        }, 1500);
      });
    }
  });

  dom.copyAllButton.addEventListener('click', () => {
    callbacks.copyAllData();
    const originalText = dom.copyAllButton.textContent;
    dom.copyAllButton.textContent = '已复制 JSON!';
    setTimeout(() => {
      dom.copyAllButton.textContent = originalText;
    }, 1500);
  });

  dom.downloadButton.addEventListener('click', () => callbacks.downloadAllData());

  // --- Initial value setup ---
  dom.selfNameInput.value = await uiState.getSelfName();
  dom.pageSizeInput.value = uiState.getState().pageSize;
  dom.autoSaveIntervalInput.value = uiState.getState().autoSaveInterval;
  dom.autoFollowInput.checked = uiState.getState().autoFollowServer;
}
