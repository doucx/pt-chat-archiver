import { effect, untracked } from '@preact/signals';
import { render } from 'preact';
import { UI_MESSAGES } from '../constants.js';
import { MigrationManager } from '../migrations.js';
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
  initDebounceMs,
  initStore,
  isLockedToBottom,
  isUIPaused,
  loadingMessage,
  pageSize,
  selectedChannel,
  setRecordingStatus,
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

  // The core reactive cycle bridging the dataAdapter and Preact Signals
  const refreshView = async () => {
    const renderId = ++currentRenderId;

    // Capture state snapshots
    const stateViewingServer = viewingServer.value;
    const stateCurrentPage = currentPage.value;
    const statePageSize = pageSize.value;
    const stateViewMode = viewMode.value;
    const stateIsLockedToBottom = isLockedToBottom.value;
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

    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
    viewCache.setTotalCount(totalCount);

    if (currentServer && finalSelectedChannel && stateViewMode !== 'config') {
      let fetchSize = statePageSize;
      let fetchPage = stateCurrentPage;
      let offset = undefined;

      if (stateViewMode === 'stats') {
        const stateStatsLimit = 5000;
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

    const newTotalPages = Math.ceil(totalCount / statePageSize) || 1;
    totalPages.value = newTotalPages;

    if (stateIsLockedToBottom && stateViewMode === 'log' && newTotalPages > stateCurrentPage) {
      currentPage.value = newTotalPages;
      if (viewCache.has(newTotalPages)) {
        messages = viewCache.get(newTotalPages);
      } else {
        const followResult = await dataAdapter.getMessages(
          currentServer,
          finalSelectedChannel,
          newTotalPages,
          statePageSize,
        );
        if (renderId !== currentRenderId) return;
        messages = followResult.messages;
        viewCache.set(newTotalPages, messages);
      }
    }

    if (renderId !== currentRenderId) return;

    // Update Signals
    serverListSig.value = serverList;
    channelListSig.value = channelList;
    channelCountsSig.value = channelCounts;
    currentMessages.value = messages;
    totalCountSig.value = totalCount;

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
    const isVisible = container.style.display === 'flex';
    if (!isVisible) refreshView();
    container.style.display = isVisible ? 'none' : 'flex';
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

  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
    alert('旧版备份已删除。');
  };

  const recoverLegacyData = async (targetServer) => {
    try {
      const rawState = await dataAdapter.getAllData();
      const newState = await MigrationManager.recoverAndMergeAll(rawState, targetServer);
      await appCallbacks.saveMessagesToStorage(newState);
      alert('数据恢复合并完成！已自动清理旧版残留。');
      refreshView();
    } catch (err) {
      console.error('[Recovery] Failed:', err);
      alert('恢复失败，详情请查看控制台。');
    }
  };

  const clearLegacyData = async () => {
    MigrationManager.clearAllLegacyData();
    alert('旧版残留数据已清理。');
  };

  const ioManager = createIOManager({ dataAdapter, appCallbacks, refreshView });

  const uiCallbacks = {
    ...appCallbacks,
    ...ioManager,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    deleteMessages: appCallbacks.deleteMessages,
    clearAllData,
    deleteV6Backup,
    recoverLegacyData,
    clearLegacyData,
  };

  // Mount Preact Tree
  render(<App dataAdapter={dataAdapter} appCallbacks={uiCallbacks} />, container);

  // Initial Data Fetch
  await refreshView();

  let isFirstEffect = true;
  effect(() => {
    // 声明状态依赖，当它们改变时触发自动刷新
    viewingServer.value;
    selectedChannel.value;
    currentPage.value;
    pageSize.value;
    viewMode.value;

    if (isFirstEffect) {
      isFirstEffect = false;
      return;
    }

    untracked(() => {
      refreshView();
    });
  });

  // Return Engine API
  return {
    updateUI: async () => {
      if (!isUIPaused.value) {
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
      await refreshView();
    },
    checkStorageUsage: async () => {}, // Stubs for removed checks
    isUIPaused: () => isUIPaused.value,
    getInitDebounceMs: () => initDebounceMs.value,
    updateRecordingStatus: async (serverName, channelName) => {
      setRecordingStatus(serverName, channelName);
      await refreshView();
    },
  };
}
