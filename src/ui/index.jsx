import { batch, effect, untracked } from '@preact/signals';
import { render } from 'preact';
import { UI_MESSAGES } from '../constants.js';
import { storageManager } from '../storage/index.js';
import { App } from './App.jsx';
import { createIOManager } from './io-manager.js';
import {
  channelCounts as channelCountsSig,
  channelList as channelListSig,
  currentMessages,
  serverList as serverListSig,
  totalCount as totalCountSig,
} from './store/dataStore.js';
import {
  currentPage,
  defaultToLastPage,
  initDebounceMs,
  initStore,
  isLockedToBottom,
  isUIPaused,
  isUIVisible,
  lastScrollTop,
  loadingMessage,
  pageSize,
  selectedChannel,
  setRecordingStatus,
  statsLimit,
  totalPages,
  viewMode,
  viewingServer,
} from './store/uiStore.js';
import { ViewCache } from './view-cache.js';

export async function createUI(dataAdapter, appCallbacks) {
  // 1. Initialize Store
  await initStore();
  const viewCache = new ViewCache();

  // 2. Setup Container & Toggle Button
  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
  container.style.display = 'none';
  document.body.appendChild(container);

  const toggleButton = document.createElement('div');
  toggleButton.id = 'log-archive-ui-toggle-button';
  toggleButton.textContent = '📝';
  document.body.appendChild(toggleButton);

  let currentRenderId = 0;
  let hasPerformedInitialJump = false;

  const preloadAdjacentPages = async (page, total, server, channel, size) => {
    const targets = [page - 1, page + 1].filter((p) => p >= 1 && p <= total && !viewCache.has(p));
    for (const p of targets) {
      dataAdapter.getMessages(server, channel, p, size).then((result) => {
        if (viewCache.server === server && viewCache.channel === channel) {
          viewCache.set(p, result.messages);
        }
      });
    }
  };

  const preloadCurrentView = async () => {
    const server = viewingServer.value;
    if (!server) return;

    const channels = await dataAdapter.getChannels(server);
    let channel = selectedChannel.value;
    if (!channel && channels.length > 0) {
      channel = channels[0];
    }
    if (!channel) return;

    let totalCount = 0;
    if (dataAdapter.getChannelCount) {
      totalCount = await dataAdapter.getChannelCount(server, channel);
    } else {
      const { total } = await dataAdapter.getMessages(server, channel, 1, 1);
      totalCount = total;
    }

    if (totalCount === 0) return;

    const size = pageSize.value;
    let targetPage = 1;
    if (defaultToLastPage.value) {
      targetPage = Math.ceil(totalCount / size) || 1;
    }

    viewCache.init(server, channel, size, 5);
    viewCache.setTotalCount(totalCount);

    if (!viewCache.has(targetPage)) {
      try {
        const result = await dataAdapter.getMessages(server, channel, targetPage, size);
        viewCache.set(targetPage, result.messages);
        preloadAdjacentPages(targetPage, Math.ceil(totalCount / size) || 1, server, channel, size);
      } catch (e) {
        console.warn('[Preload] Failed to preload messages:', e);
      }
    }
  };

  // The core reactive cycle bridging the dataAdapter and Preact Signals
  const refreshView = async () => {
    if (!isUIVisible.value) return;
    const renderId = ++currentRenderId;

    // Capture state snapshots
    const stateViewingServer = viewingServer.value;
    let stateCurrentPage = currentPage.value;
    const statePageSize = pageSize.value;
    const stateViewMode = viewMode.value;
    let stateIsLockedToBottom = isLockedToBottom.value;
    const stateSelectedChannel = selectedChannel.value;

    const serverList = await dataAdapter.getServers();
    if (!stateViewingServer && serverList.length > 0) {
      viewingServer.value = serverList[0];
    }
    const currentServer = viewingServer.value;

    if (!currentServer) {
      serverListSig.value = [];
      channelListSig.value = [];
      channelCountsSig.value = {};
      currentMessages.value = [];
      totalCountSig.value = 0;
      loadingMessage.value = '';
      return;
    }

    const channelList = await dataAdapter.getChannels(currentServer);
    const channelCounts = {};

    await Promise.all(
      channelList.map(async (ch) => {
        if (dataAdapter.getChannelCount) {
          channelCounts[ch] = await dataAdapter.getChannelCount(currentServer, ch);
        } else {
          const { total } = await dataAdapter.getMessages(currentServer, ch, 1, 1);
          channelCounts[ch] = total;
        }
      }),
    );

    let finalSelectedChannel = stateSelectedChannel;
    if (!finalSelectedChannel && channelList.length > 0) {
      finalSelectedChannel = channelList[0];
      selectedChannel.value = finalSelectedChannel;
    } else if (finalSelectedChannel && !channelList.includes(finalSelectedChannel)) {
      finalSelectedChannel = channelList[0];
      selectedChannel.value = finalSelectedChannel;
    }

    let messages = [];
    let totalCount = finalSelectedChannel ? channelCounts[finalSelectedChannel] || 0 : 0;

    // 处理首次打开或切换频道/服务器时的自动跳转逻辑
    const isContextSwitched =
      !hasPerformedInitialJump ||
      viewCache.server !== currentServer ||
      viewCache.channel !== finalSelectedChannel;

    if (isContextSwitched && totalCount > 0) {
      const targetInitialPage = defaultToLastPage.value
        ? Math.ceil(totalCount / statePageSize) || 1
        : 1;
      batch(() => {
        currentPage.value = targetInitialPage;
        isLockedToBottom.value = defaultToLastPage.value;
        lastScrollTop.value = 0;
      });
      hasPerformedInitialJump = true;
      // 重新捕获跳转后的状态 snapshot
      stateCurrentPage = targetInitialPage;
      stateIsLockedToBottom = defaultToLastPage.value;
    }

    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
    viewCache.setTotalCount(totalCount);

    if (currentServer && finalSelectedChannel && stateViewMode !== 'config') {
      let fetchSize = statePageSize;
      let fetchPage = stateCurrentPage;
      let offset = undefined;

      if (stateViewMode === 'stats') {
        const stateStatsLimit = statsLimit.value;
        fetchSize = stateStatsLimit;
        offset = Math.max(0, totalCount - stateStatsLimit);
        fetchPage = 1;

        loadingMessage.value = UI_MESSAGES.LOADING_PREPARE;
        await new Promise((r) => setTimeout(r, 10));
        if (renderId !== currentRenderId) return;

        const result = await dataAdapter.getMessages(
          currentServer,
          finalSelectedChannel,
          fetchPage,
          fetchSize,
          (current, total) => {
            if (renderId !== currentRenderId) return;
            const percentage = current / total;
            loadingMessage.value = `${UI_MESSAGES.LOADING_STATS}\n    已读取: ${current} / ${total} 条 (${Math.round(percentage * 100)}%)`;
          },
          offset,
        );
        if (renderId !== currentRenderId) return;
        messages = result.messages;
        loadingMessage.value = '';
      } else {
        if (viewCache.has(fetchPage)) {
          messages = viewCache.get(fetchPage);
          loadingMessage.value = '';
        } else {
          loadingMessage.value = UI_MESSAGES.LOADING_PREPARE;
          await new Promise((r) => setTimeout(r, 10));
          if (renderId !== currentRenderId) return;

          const result = await dataAdapter.getMessages(
            currentServer,
            finalSelectedChannel,
            fetchPage,
            fetchSize,
            (current, total) => {
              if (renderId !== currentRenderId) return;
              const percentage = current / total;
              loadingMessage.value = `${UI_MESSAGES.LOADING_HISTORY}\n    已读取: ${current} / ${total} 条 (${Math.round(percentage * 100)}%)`;
            },
          );

          if (renderId !== currentRenderId) return;
          messages = result.messages;
          totalCount = result.total;
          viewCache.setTotalCount(totalCount);
          viewCache.set(fetchPage, messages);

          loadingMessage.value = UI_MESSAGES.LOADING_BUILDING;
          await new Promise((r) => setTimeout(r, 10));
          loadingMessage.value = '';
        }
      }
    }

    if (stateViewMode === 'config') {
      loadingMessage.value = '';
    }

    const newTotalPages = Math.ceil(totalCount / statePageSize) || 1;

    // 使用 batch 确保内部的多次信号修改只触发一次重新渲染
    batch(() => {
      totalPages.value = newTotalPages;

      if (stateIsLockedToBottom && stateViewMode === 'log' && newTotalPages > stateCurrentPage) {
        currentPage.value = newTotalPages;
        // 注意：这里由于 currentPage 变了，后续会由 effect 再次触发拉取，
        // 但为了交互平滑，这里我们保持内存中的 messages 更新
      } else if (currentPage.value > newTotalPages) {
        currentPage.value = newTotalPages;
      }

      if (renderId !== currentRenderId) return;

      serverListSig.value = serverList;
      channelListSig.value = channelList;
      channelCountsSig.value = channelCounts;
      currentMessages.value = [...messages]; // 强制创建新引用以触发布局重绘
      totalCountSig.value = totalCount;
    });

    if (stateViewMode === 'log' && currentServer && finalSelectedChannel) {
      preloadAdjacentPages(
        stateCurrentPage,
        newTotalPages,
        currentServer,
        finalSelectedChannel,
        statePageSize,
      );
    }
  };

  // Setup DOM Interactions for toggle
  toggleButton.addEventListener('click', () => {
    isUIVisible.value = !isUIVisible.value;
  });

  effect(() => {
    container.style.display = isUIVisible.value ? 'flex' : 'none';
  });

  // Action Handlers
  const clearAllData = async () => {
    if (confirm('【严重警告】此操作将清空所有本地存储的聊天存档。此操作不可恢复！确定要执行吗？')) {
      appCallbacks.deactivateLogger();
      await storageManager.clearAllData();
      viewCache.clear();
      await appCallbacks.scanAndMergeHistory();
      refreshView();
    }
  };

  const ioManager = createIOManager({ dataAdapter, appCallbacks, refreshView });

  const closeUI = () => {
    isUIVisible.value = false;
  };

  const uiCallbacks = {
    ...appCallbacks,
    ...ioManager,
    closeUI,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    deleteMessages: appCallbacks.deleteMessages,
    clearAllData,
  };

  // Mount Preact Tree
  render(<App dataAdapter={dataAdapter} appCallbacks={uiCallbacks} />, container);

  // 响应式数据拉取驱动：effect 会在创建时自动同步触发一次 refreshView
  const stopEffect = effect(() => {
    // 订阅关键路由信号
    const v = isUIVisible.value;
    const s = viewingServer.value;
    const c = selectedChannel.value;
    const p = currentPage.value;
    const sz = pageSize.value;
    const m = viewMode.value;

    // 仅在界面可见时执行昂贵的同步
    if (v) {
      untracked(() => {
        refreshView();
      });
    }
  });

  // 仅在界面不可见、且检测到服务器时进行后台静默加载
  const stopPreloadEffect = effect(() => {
    const v = isUIVisible.value;
    const s = viewingServer.value;
    const c = selectedChannel.value;

    if (!v && s) {
      untracked(() => {
        preloadCurrentView();
      });
    }
  });

  // Return Engine API
  return {
    destroy: () => {
      stopEffect();
      stopPreloadEffect();
      render(null, container);
      container.remove();
      toggleButton.remove();
    },
    updateUI: async () => {
      if (!isUIPaused.value && isUIVisible.value) {
        await refreshView();
      }
    },
    onNewMessage: (msg) => {
      viewCache.pushNewMessage(msg);
    },
    invalidateCache: () => {
      viewCache.clear();
    },
    setState: async (newState) => {
      // 状态由外部修改后，effect 会自动处理刷新
    },
    checkStorageUsage: async () => {}, // Stubs for removed checks
    isUIPaused: () => isUIPaused.value,
    getInitDebounceMs: () => initDebounceMs.value,
    updateRecordingStatus: async (serverName, channelName) => {
      // 仅修改信号，触发全局 effect 刷新数据
      setRecordingStatus(serverName, channelName);
    },
  };
}
