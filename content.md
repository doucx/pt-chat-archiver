[简要回答]
我们将启动 Phase 1 重构，核心是将 UI 与全量内存状态解耦，引入 `DataAdapter` 接口来模拟异步分页获取数据。这是引入 Web Worker 和 IndexedDB 增量读取的前置条件。

## [WIP] refactor(ui): 实施异步数据获取架构 (Phase 1)

### 用户需求
目前的 UI 渲染直接依赖于主线程中巨大的 `inMemoryChatState` 同步对象。为了支持后续的 IndexedDB 按需加载和 Web Worker 架构，需要将 UI 重构为“请求-响应”的异步模式，不再持有全量数据。

### 评论
这是一个侵入性较大的重构，涉及 `main.js` (数据源)、`ui/index.js` (控制器)、`renderer.js` (视图) 和 `events.js` (交互) 的协同修改。虽然目前底层数据仍主要在内存中，但接口层将完全模拟异步分页行为。

### 目标
1.  在 `main.js` 中定义并实现 `DataAdapter` 接口（`getServers`, `getChannels`, `getMessages` 等）。
2.  重构 `createUI`，不再接收 `initialAppState`，改为接收 `dataAdapter`。
3.  重构 `renderer.js`，使其 `render` 函数只接受当前视图所需的扁平数据 (`RenderContext`)，移除所有状态切片逻辑。
4.  重构 `ui/index.js` 和 `events.js`，实现 `refreshView` 异步流程：调用 Adapter -> 等待数据 -> 更新 UI State -> 调用 Renderer。

### 基本原理
通过引入 `DataAdapter` 抽象层，切断 UI 对全局状态对象的直接引用。
- **之前**: UI 拥有所有数据，自己决定显示什么 (Slice)。
- **之后**: UI 告诉 Adapter 我要什么 (Request)，Adapter 返回数据，UI 显示。
这使得未来我们可以透明地将 Adapter 的实现替换为 Web Worker RPC 调用，而无需再次修改 UI 代码。

### 标签
#intent/refine #flow/ready #priority/high #comp/ui #comp/runtime #scope/core #task/domain/ui #task/object/rendering-pipeline #task/action/async-refactor #task/state/begin

---

### Script

#### Acts 1: 定义 DataAdapter 并重构 main.js

我们将首先在 `main.js` 中构建数据适配器，并调整 `createUI` 的调用方式。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~old
    // 2. 加载状态与初始化 UI
    inMemoryChatState = await storageManager.loadAllV6();
    uiControls = await createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage: (state) => storageManager.saveAllV6(state), // Pass a compatible function
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
      manualSave: performAutoSave,
      onAutoSaveIntervalChange: startAutoSaveTimer,
      replaceState: (newState) => {
        inMemoryChatState = newState;
      },
    });
~~~~~
~~~~~new
    // 2. 加载状态与初始化 UI
    inMemoryChatState = await storageManager.loadAllV6();

    // 构建 DataAdapter：UI 层与数据层的隔离界面
    const dataAdapter = {
      getServers: async () => Object.keys(inMemoryChatState),
      getChannels: async (server) => Object.keys(inMemoryChatState[server] || {}),
      getMessages: async (server, channel, page, pageSize) => {
        const list = inMemoryChatState[server]?.[channel] || [];
        const total = list.length;
        const start = (page - 1) * pageSize;
        // 模拟异步延迟以确保 UI 能够正确处理 Loading 态 (可选，暂不加延迟)
        return {
          messages: list.slice(start, start + pageSize),
          total,
        };
      },
      getAllData: async () => inMemoryChatState, // 用于导出功能
      // 兼容旧接口，用于分析模块
      getRawState: () => inMemoryChatState, 
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: (state) => storageManager.saveAllV6(state), // Pass a compatible function
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
      manualSave: performAutoSave,
      onAutoSaveIntervalChange: startAutoSaveTimer,
      replaceState: (newState) => {
        inMemoryChatState = newState;
        // 注意：UI 内部现在不持有 state，所以 replaceState 后 UI 会通过 refreshView 自动拉取新数据
      },
    });
~~~~~

#### Acts 2: 重构 Renderer 为纯展示组件

修改 `renderer.js`，使其不再计算分页，只负责渲染传入的数据。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~old
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
~~~~~
~~~~~new
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
    const { viewMode, currentPage, totalPages, viewingServer, activeServer, isLockedToBottom } =
      uiState.getState();
    const { serverList, channelList, channelCounts, messages } = context;

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

    // 3. 更新频道选择器
    const prevChannelValue = dom.channelSelector.value;
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
      if (prevChannelValue && channelList.includes(prevChannelValue)) {
        dom.channelSelector.value = prevChannelValue;
      } else if (channelList.length > 0) {
        dom.channelSelector.value = channelList[0];
      }
    }
    const selectedChannel = dom.channelSelector.value;

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

      const { lastSavedTime } = uiState.getState();
      if (lastSavedTime) {
        dom.lastSavedInfo.textContent = `上次保存: ${formatISOTimeForDisplay(lastSavedTime).split(' ')[1]}`;
      } else {
        dom.lastSavedInfo.textContent = '尚未保存';
      }

      // 计算重复项总数 (需要从 callbacks 获取全量数据进行计算，或者由上层计算后传入)
      // 这里的逻辑暂时保留依赖 callbacks，直到查重功能也被重构
      if (callbacks.detectTotalDuplicates && callbacks.getRawState) {
        const rawState = callbacks.getRawState();
        let totalDuplicates = 0;
        for (const server in rawState) {
          totalDuplicates += callbacks.detectTotalDuplicates(rawState[server]);
        }
        updateCleanButtonState(totalDuplicates);
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
~~~~~

#### Acts 3: 更新 events.js 适配异步刷新

`events.js` 需要调用 `refreshUI` 而不是直接调用 `renderer.render`。我们将 `fullRender` 替换为 `refreshView`。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~old
export async function bindUIEvents({ dom, uiState, renderer, getAppState, callbacks }) {
  const fullRender = () => renderer.render(getAppState(), callbacks);

  // --- Main UI controls ---
  dom.toggleButton.addEventListener('click', () => {
    const isVisible = dom.uiContainer.style.display === 'flex';
    if (!isVisible) fullRender();
    dom.uiContainer.style.display = isVisible ? 'none' : 'flex';
  });
~~~~~
~~~~~new
export async function bindUIEvents({ dom, uiState, refreshView, callbacks }) {
  // refreshView 已经被绑定了 DataAdapter，调用它会触发 fetch -> render 流程
  const triggerRefresh = () => refreshView(); 

  // --- Main UI controls ---
  dom.toggleButton.addEventListener('click', () => {
    const isVisible = dom.uiContainer.style.display === 'flex';
    if (!isVisible) triggerRefresh();
    dom.uiContainer.style.display = isVisible ? 'none' : 'flex';
  });
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~old
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
        fullRender();
      }
    } else {
      // 2. 未锁定状态下，如果在最后一页手动滑到底部，则自动加锁
      if (isAtBottom && currentPage === totalPages) {
        uiState.setLockedToBottom(true);
        fullRender();
      }
    }
  });

  // --- Pagination ---
  dom.pageFirstBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(1);
    fullRender();
  });
  dom.pagePrevBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(uiState.getState().currentPage - 1);
    fullRender();
  });
  dom.pageNextBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(uiState.getState().currentPage + 1);
    fullRender();
  });
  dom.pageLastBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().totalPages);
    uiState.setLockedToBottom(true);
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
    }, UI_FEEDBACK_DURATION);
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

  dom.recoverButton.addEventListener('click', async () => {
    const { viewingServer } = uiState.getState();
    const confirmMsg = `【数据恢复】此操作将尝试从 localStorage 提取旧数据并合并到当前数据库。

- v6 数据将按服务器自动归类。
- v4/v5 数据将合并到您当前查看的服务器: [${viewingServer}]。

建议在此操作前先“下载备份”以防万一。是否继续？`;

    if (confirm(confirmMsg)) {
      await callbacks.recoverLegacyData(viewingServer);
      fullRender();
    }
  });

  dom.ignoreLegacyButton.addEventListener('click', async () => {
    if (
      confirm(
        '【严重警告】此操作将永久删除 localStorage 中的旧版聊天记录残留。此操作不可撤销，确定要清理吗？',
      )
    ) {
      await callbacks.clearLegacyData();
      fullRender();
    }
  });
~~~~~
~~~~~new
  dom.pauseButton.addEventListener('click', () => {
    const isPaused = uiState.togglePause();
    dom.pauseButton.classList.toggle('paused', isPaused);
    dom.pauseButton.textContent = isPaused ? '▶️ ' : '⏸️ ';
    if (!isPaused) triggerRefresh();
  });

  dom.channelSelector.addEventListener('change', () => {
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

  dom.autoSaveIntervalInput.addEventListener('change', async () => {
    await uiState.setAutoSaveInterval(dom.autoSaveIntervalInput.value);
    callbacks.onAutoSaveIntervalChange();
    triggerRefresh();
  });

  dom.autoFollowInput.addEventListener('change', async () => {
    await uiState.setAutoFollowServer(dom.autoFollowInput.checked);
    triggerRefresh();
  });

  dom.saveNowButton.addEventListener('click', async () => {
    await callbacks.manualSave();
    const originalText = dom.saveNowButton.textContent;
    dom.saveNowButton.textContent = '✅ 已保存';
    setTimeout(() => {
      dom.saveNowButton.textContent = originalText;
    }, UI_FEEDBACK_DURATION);
  });

  dom.cleanButton.addEventListener('click', async () => {
    await callbacks.cleanChannelRecords();
    triggerRefresh(); // Re-render to update button state
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
~~~~~

#### Acts 4: 重构 ui/index.js 控制器逻辑

`ui/index.js` 现在负责协调数据获取。它接收 `DataAdapter`，实现 `refreshView` 逻辑（计算分页、请求数据、传递给 Renderer）。同时保持 `appState` 的局部副本用于一些未重构的导出功能。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~old
import { UI_FEEDBACK_DURATION } from '../constants.js';
import { MigrationManager } from '../migrations.js';
import { storageManager } from '../storage/index.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
import { createRenderer, formatMessageForDisplay } from './renderer.js';
import { createUIState } from './state.js';

/**
 * Initializes and orchestrates the entire UI module.
 * @param {object} initialAppState - The initial application state (inMemoryChatState).
 * @param {object} appCallbacks - Callbacks for application-level actions.
 * @returns {Promise<object>} Public API for the UI module.
 */
export async function createUI(initialAppState, appCallbacks) {
  let appState = initialAppState;

  // 1. Initialize DOM structure
  initDOM(__APP_VERSION__);
  const dom = getDOMElements();

  // 2. Create state and renderer instances
  const uiState = await createUIState();
  const renderer = createRenderer(dom, uiState);

  // 3. Prepare callbacks and bind events
  const getAppState = () => appState;

  // --- Export Helper Functions ---
~~~~~
~~~~~new
import { UI_FEEDBACK_DURATION } from '../constants.js';
import { MigrationManager } from '../migrations.js';
import { storageManager } from '../storage/index.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
import { createRenderer, formatMessageForDisplay } from './renderer.js';
import { createUIState } from './state.js';

/**
 * Initializes and orchestrates the entire UI module.
 * @param {object} dataAdapter - The adapter interface to fetch data (Async).
 * @param {object} appCallbacks - Callbacks for application-level actions.
 * @returns {Promise<object>} Public API for the UI module.
 */
export async function createUI(dataAdapter, appCallbacks) {
  // 临时保留 appState 仅用于那些尚未重构的导出功能 (downloadJSON etc.)
  // 一旦这些功能也迁移到 Adapter，这个变量即可移除
  let legacyAppState = await dataAdapter.getAllData();

  // 1. Initialize DOM structure
  initDOM(__APP_VERSION__);
  const dom = getDOMElements();

  // 2. Create state and renderer instances
  const uiState = await createUIState();
  const renderer = createRenderer(dom, uiState);

  // --- Async Controller Logic ---

  /**
   * 核心控制器方法：异步刷新视图
   * 1. 获取 UI 状态 (当前服务器、页码等)
   * 2. 调用 Adapter 获取数据 (消息列表、总数等)
   * 3. 计算派生状态 (TotalPages)
   * 4. 调用 Renderer 更新 DOM
   */
  const refreshView = async () => {
    const { viewingServer, currentPage, pageSize, viewMode, isLockedToBottom } = uiState.getState();
    const serverList = await dataAdapter.getServers();

    // 确保 viewingServer 有效
    if (!viewingServer && serverList.length > 0) {
      uiState.setViewingServer(serverList[0]);
    }
    const currentServer = uiState.getState().viewingServer; // 可能已被上面更新
    
    // 获取当前服务器的频道列表和统计信息
    const channelList = await dataAdapter.getChannels(currentServer);
    const channelCounts = {};
    for (const ch of channelList) {
      // 临时：为了 Phase 1 快速实现，我们这里可能需要优化
      // 现在的 getMessages 返回 total，我们或许需要一个独立的 getChannelStats
      // 这里的实现依赖 getMessages 的开销，如果是全量内存没问题，如果是 DB 可能会慢
      // 暂时先用 dummy 或者让 renderer 自己处理？
      // Renderer 需要显示 "Global (500)"。
      // 让我们假设 inMemoryState 依然很快。
      const { total } = await dataAdapter.getMessages(currentServer, ch, 1, 1);
      channelCounts[ch] = total;
    }

    // 确定当前选中的 Channel (Renderer 依赖 DOM，但我们可以先从 DOM 读一下之前的选择?)
    // 更好的方式是 UI State 也管理 selectedChannel，但目前在 DOM 里。
    // 我们先渲染一次 Server/Channel 列表，让 DOM 更新，然后读取值，再请求消息？
    // 或者一次性把上下文给 Renderer，让 Renderer 决定 Channel，然后 Renderer 再回调请求消息？
    // 不，这太复杂。
    // 简化方案：Controller 读取 DOM 状态 (Dirty read)
    let selectedChannel = dom.channelSelector.value;
    if (!selectedChannel && channelList.length > 0) selectedChannel = channelList[0];
    
    // 如果列表变了导致 selectedChannel 无效，修正它
    if (selectedChannel && !channelList.includes(selectedChannel)) selectedChannel = channelList[0];

    // 获取消息数据
    let messages = [];
    let totalCount = 0;

    if (currentServer && selectedChannel) {
        // 如果是 stats 模式，可能需要全量数据 (Phase 1 临时兼容)
        const fetchSize = viewMode === 'stats' ? 999999 : pageSize;
        const fetchPage = viewMode === 'stats' ? 1 : currentPage;
        
        const result = await dataAdapter.getMessages(currentServer, selectedChannel, fetchPage, fetchSize);
        messages = result.messages;
        totalCount = result.total;
    }

    // 更新分页状态
    const newTotalPages = Math.ceil(totalCount / pageSize);
    uiState.setTotalPages(newTotalPages);

    // 自动吸附逻辑修正: 如果锁定了底部，强制跳到最后一页
    // (这需要在 fetch 之前做吗？不需要，fetch 后发现页码不对再 fetch? 
    //  不，为了性能，应该在 fetch 前决定。但 totalCount 未知...)
    // 现在的逻辑是：先 fetch 这一页，Renderer 发现不对劲会改页码。
    // 我们保持原样，Renderer 可能会修正页码并触发重绘吗？
    // 原 Renderer 逻辑: if (locked) setPage(total); 
    // 这会导致一次额外的渲染。为了 Phase 1 简单，先保留。
    
    const context = {
        serverList,
        channelList,
        channelCounts,
        messages,
        totalCount
    };

    renderer.render(context, uiCallbacks);
  };

  // --- Export Helper Functions ---
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~old
  // --- Export Callbacks ---

  const downloadJSON = () => {
    if (Object.keys(appState).length === 0) return;
    triggerDownload(
      JSON.stringify(appState, null, 2),
      `pt-saver-${getExportTimestamp()}.json`,
      'application/json',
    );
  };

  const downloadTXT = () => {
    if (Object.keys(appState).length === 0) return;
    const text = generateFullTextExport(appState);
    triggerDownload(text, `pt-saver-${getExportTimestamp()}.txt`, 'text/plain');
  };

  const copyJSON = () => {
    const data = JSON.stringify(appState, null, 2);
    navigator.clipboard.writeText(data);
  };

  const copyTXT = () => {
    const text = generateFullTextExport(appState);
    navigator.clipboard.writeText(text);
  };

  const importAllData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);

          // 基础结构校验
          if (
            typeof importedData !== 'object' ||
            importedData === null ||
            Array.isArray(importedData)
          ) {
            throw new Error('无效的存档格式：根节点必须是一个对象。');
          }

          const serverCount = Object.keys(importedData).length;
          const warning = `准备导入文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n【严重警告】\n此操作将完全清空并覆盖当前浏览器的所有本地存档！\n此操作不可撤销。\n\n确定要继续吗？`;

          if (confirm(warning)) {
            // 1. 更新全局状态引用 (main.js)
            if (appCallbacks.replaceState) {
              appCallbacks.replaceState(importedData);
            }
            // 2. 更新 UI 本地状态
            appState = importedData;

            // 3. 持久化
            await appCallbacks.saveMessagesToStorage(appState);

            const originalText = dom.importButton.textContent;
            dom.importButton.textContent = '✅ 导入成功';
            setTimeout(() => {
              dom.importButton.textContent = originalText;
            }, UI_FEEDBACK_DURATION);

            renderer.render(appState, uiCallbacks);
          }
        } catch (err) {
          console.error('[Archiver] Import failed:', err);
          alert(`导入失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };

    input.click();
  };

  const cleanChannelRecords = async () => {
    let totalToClean = 0;
    for (const server in appState) {
      totalToClean += appCallbacks.detectTotalDuplicates(appState[server]);
    }

    if (totalToClean === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${totalToClean} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const server in appState) {
        const serverData = appState[server];
        for (const channel in serverData) {
          const { cleanedRecords } = appCallbacks.cleanChannelRecords(serverData[channel]);
          serverData[channel] = cleanedRecords;
        }
      }
      await appCallbacks.saveMessagesToStorage(appState);
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        renderer.render(appState, uiCallbacks);
      }, UI_FEEDBACK_DURATION);
    }
  };

  const clearAllData = async () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      await storageManager.clearAllData();
      for (const key of Object.keys(appState)) {
        delete appState[key];
      }
      await appCallbacks.scanAndMergeHistory();
      await appCallbacks.saveMessagesToStorage(appState);
      renderer.render(appState, uiCallbacks);
    }
  };

  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
  };

  const recoverLegacyData = async (targetServer) => {
    try {
      const newState = await MigrationManager.recoverAndMergeAll(appState, targetServer);
      if (appCallbacks.replaceState) {
        appCallbacks.replaceState(newState);
      }
      appState = newState;
      await appCallbacks.saveMessagesToStorage(appState);
      alert('数据恢复合并完成！已自动清理旧版残留。');
    } catch (err) {
      console.error('[Recovery] Failed:', err);
      alert('恢复失败，详情请查看控制台。');
    }
  };
~~~~~
~~~~~new
  // --- Export Callbacks ---

  const downloadJSON = async () => {
    const allData = await dataAdapter.getAllData();
    if (Object.keys(allData).length === 0) return;
    triggerDownload(
      JSON.stringify(allData, null, 2),
      `pt-saver-${getExportTimestamp()}.json`,
      'application/json',
    );
  };

  const downloadTXT = async () => {
    const allData = await dataAdapter.getAllData();
    if (Object.keys(allData).length === 0) return;
    const text = generateFullTextExport(allData);
    triggerDownload(text, `pt-saver-${getExportTimestamp()}.txt`, 'text/plain');
  };

  const copyJSON = async () => {
    const allData = await dataAdapter.getAllData();
    const data = JSON.stringify(allData, null, 2);
    navigator.clipboard.writeText(data);
  };

  const copyTXT = async () => {
    const allData = await dataAdapter.getAllData();
    const text = generateFullTextExport(allData);
    navigator.clipboard.writeText(text);
  };

  const importAllData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);

          // 基础结构校验
          if (
            typeof importedData !== 'object' ||
            importedData === null ||
            Array.isArray(importedData)
          ) {
            throw new Error('无效的存档格式：根节点必须是一个对象。');
          }

          const serverCount = Object.keys(importedData).length;
          const warning = `准备导入文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n【严重警告】\n此操作将完全清空并覆盖当前浏览器的所有本地存档！\n此操作不可撤销。\n\n确定要继续吗？`;

          if (confirm(warning)) {
            // 1. 更新全局状态引用 (main.js)
            if (appCallbacks.replaceState) {
              appCallbacks.replaceState(importedData);
            }
            // 2. 更新 UI 本地 legacy 状态 (用于未重构的功能)
            legacyAppState = importedData;

            // 3. 持久化
            await appCallbacks.saveMessagesToStorage(importedData);

            const originalText = dom.importButton.textContent;
            dom.importButton.textContent = '✅ 导入成功';
            setTimeout(() => {
              dom.importButton.textContent = originalText;
            }, UI_FEEDBACK_DURATION);

            refreshView();
          }
        } catch (err) {
          console.error('[Archiver] Import failed:', err);
          alert(`导入失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };

    input.click();
  };

  // 注意：cleanChannelRecords 等功能仍深度依赖同步计算，
  // 在 Phase 4 重构分析模块之前，我们暂时保留其同步逻辑，
  // 但操作的是 legacyAppState，并通过 callbacks 同步回 main.js
  const cleanChannelRecords = async () => {
    let totalToClean = 0;
    // 使用 legacyAppState 进行同步计算
    for (const server in legacyAppState) {
      totalToClean += appCallbacks.detectTotalDuplicates(legacyAppState[server]);
    }

    if (totalToClean === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${totalToClean} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const server in legacyAppState) {
        const serverData = legacyAppState[server];
        for (const channel in serverData) {
          const { cleanedRecords } = appCallbacks.cleanChannelRecords(serverData[channel]);
          serverData[channel] = cleanedRecords;
        }
      }
      await appCallbacks.saveMessagesToStorage(legacyAppState);
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        refreshView();
      }, UI_FEEDBACK_DURATION);
    }
  };

  const clearAllData = async () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      await storageManager.clearAllData();
      for (const key of Object.keys(legacyAppState)) {
        delete legacyAppState[key];
      }
      await appCallbacks.scanAndMergeHistory();
      await appCallbacks.saveMessagesToStorage(legacyAppState);
      refreshView();
    }
  };

  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
  };

  const recoverLegacyData = async (targetServer) => {
    try {
      const newState = await MigrationManager.recoverAndMergeAll(legacyAppState, targetServer);
      if (appCallbacks.replaceState) {
        appCallbacks.replaceState(newState);
      }
      legacyAppState = newState;
      await appCallbacks.saveMessagesToStorage(legacyAppState);
      alert('数据恢复合并完成！已自动清理旧版残留。');
    } catch (err) {
      console.error('[Recovery] Failed:', err);
      alert('恢复失败，详情请查看控制台。');
    }
  };
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~old
  await bindUIEvents({
    dom,
    uiState,
    renderer,
    getAppState,
    callbacks: uiCallbacks,
  });

  // 4. Initial Render
  renderer.render(appState, uiCallbacks);

  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        renderer.render(appState, uiCallbacks);
      }
    },
    setState: (newState) => {
      appState = newState;
      renderer.render(appState, uiCallbacks);
    },
    checkStorageUsage: async () => await renderer.checkStorageUsage(),
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      renderer.render(appState, uiCallbacks);
    },
    setLastSavedTime: (time) => {
      uiState.setLastSavedTime(time);
      renderer.render(appState, uiCallbacks);
    },
    getAutoSaveInterval: () => uiState.getState().autoSaveInterval,
  };
}
~~~~~
~~~~~new
  await bindUIEvents({
    dom,
    uiState,
    refreshView,
    callbacks: uiCallbacks,
  });

  // 4. Initial Render
  refreshView();

  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        refreshView();
      }
    },
    setState: (newState) => {
      legacyAppState = newState;
      refreshView();
    },
    checkStorageUsage: async () => await renderer.checkStorageUsage(),
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      refreshView();
    },
    setLastSavedTime: (time) => {
      uiState.setLastSavedTime(time);
      refreshView();
    },
    getAutoSaveInterval: () => uiState.getState().autoSaveInterval,
  };
}
~~~~~

### 下一步建议
我们已经完成了 UI 层的异步化改造。现在的 UI 已经不再关心数据是从内存同步读取的，还是从 IndexedDB 异步读取的。
下一步，我们将进入 **Phase 2: 数据库层现代化**，我们将实现真正的 IDB 增量读写，并移除 main.js 中的内存缓存，使 `DataAdapter` 直接操作 `StorageManager` 的新异步接口。这将彻底解决内存占用问题。
