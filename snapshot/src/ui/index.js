import { UI_MESSAGES } from '../constants.js';
import { MigrationManager } from '../migrations.js';
import { storageManager } from '../storage/index.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
import { createIOManager } from './io-manager.js';
import { createRenderer } from './renderer.js';
import { createUIState } from './state.js';
import { serverList as serverListSig, channelList as channelListSig, channelCounts as channelCountsSig, currentMessages, totalCount as totalCountSig } from './store/dataStore.js';
import { ViewCache } from './view-cache.js';

/**
 * Initializes and orchestrates the entire UI module.
 * @param {object} dataAdapter - The adapter interface to fetch data (Async).
 * @param {object} appCallbacks - Callbacks for application-level actions.
 * @returns {Promise<object>} Public API for the UI module.
 */
export async function createUI(dataAdapter, appCallbacks) {
  // 1. Initialize DOM structure
  initDOM(__APP_VERSION__);
  const dom = getDOMElements();

  // 2. Create state and renderer instances
  const uiState = await createUIState();
  const renderer = createRenderer(dom, uiState);
  const viewCache = new ViewCache();

  let currentRenderId = 0;

  /**
   * 预加载当前页的相邻页面。
   * 采用静默加载模式，不触发 UI 状态更新。
   */
  const preloadAdjacentPages = async (page, total, server, channel, size) => {
    // 仅预加载 1 页半径内的未命中页面
    const targets = [page - 1, page + 1].filter((p) => p >= 1 && p <= total && !viewCache.has(p));

    for (const p of targets) {
      // 异步抓取，不使用 await 以免阻塞
      dataAdapter.getMessages(server, channel, p, size).then((result) => {
        // 校验上下文，确保在异步返回时用户没有切换频道
        if (viewCache.server === server && viewCache.channel === channel) {
          viewCache.set(p, result.messages);
        }
      });
    }
  };

  // --- Async Controller Logic ---

  /**
   * 核心控制器方法：异步刷新视图
   * 1. 获取 UI 状态 (当前服务器、页码等)
   * 2. 调用 Adapter 获取数据 (消息列表、总数等)
   * 3. 计算派生状态 (TotalPages)
   * 4. 调用 Renderer 更新 DOM
   */
  const refreshView = async () => {
    const renderId = ++currentRenderId;
    const {
      viewingServer,
      currentPage,
      pageSize,
      totalPages,
      viewMode,
      isLockedToBottom,
      selectedChannel: stateChannel,
    } = uiState.getState();

    // 乐观更新分页指示器：在进行任何异步操作前，立即反馈页码变化
    if (viewMode === 'log') {
      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = isLast;
    }

    const serverList = await dataAdapter.getServers();

    // 确保 viewingServer 有效
    if (!viewingServer && serverList.length > 0) {
      uiState.setViewingServer(serverList[0]);
    }
    const currentServer = uiState.getState().viewingServer;

    if (!currentServer) {
      // 如果没有任何服务器数据，渲染空上下文
      return renderer.render(
        {
          serverList,
          channelList: [],
          channelCounts: {},
          messages: [],
          totalCount: 0,
        },
        uiCallbacks,
      );
    }

    // 获取当前服务器的频道列表和统计信息
    const channelList = await dataAdapter.getChannels(currentServer);
    const channelCounts = {};

    // 使用 Promise.all 并行获取各个频道的总数，极大提升刷新速度
    await Promise.all(
      channelList.map(async (ch) => {
        if (dataAdapter.getChannelCount) {
          channelCounts[ch] = await dataAdapter.getChannelCount(currentServer, ch);
        } else {
          // 降级方案：如果适配器未实现此接口，回落到查询第一页来获取 total
          const { total } = await dataAdapter.getMessages(currentServer, ch, 1, 1);
          channelCounts[ch] = total;
        }
      }),
    );

    // 确定当前选中的 Channel
    let selectedChannel = stateChannel;

    // 如果未选择或列表变动导致原选择失效，修正它并同步回 uiState
    if (!selectedChannel && channelList.length > 0) {
      selectedChannel = channelList[0];
      uiState.setSelectedChannel(selectedChannel);
    } else if (selectedChannel && !channelList.includes(selectedChannel)) {
      selectedChannel = channelList[0];
      uiState.setSelectedChannel(selectedChannel);
    }

    // 获取消息数据
    let messages = [];
    let totalCount = selectedChannel ? channelCounts[selectedChannel] || 0 : 0;

    // 初始化并同步缓存上下文
    const maxCachePages = uiState.getState().cachePages || 5;
    viewCache.init(currentServer, selectedChannel, pageSize, maxCachePages);
    viewCache.setTotalCount(totalCount);

    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      let fetchSize = pageSize;
      let fetchPage = currentPage;
      let offset = undefined;

      if (viewMode === 'stats') {
        const { statsLimit } = uiState.getState();
        fetchSize = statsLimit;
        offset = Math.max(0, totalCount - statsLimit);
        fetchPage = 1;

        // stats 模式特殊，绕过分页缓存，全量拉取
        dom.logDisplay.value = UI_MESSAGES.LOADING_PREPARE;
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (renderId !== currentRenderId) return;

        const result = await dataAdapter.getMessages(
          currentServer,
          selectedChannel,
          fetchPage,
          fetchSize,
          (current, total) => {
            if (renderId !== currentRenderId) return;
            const width = 20;
            const percentage = current / total;
            const filled = Math.round(width * percentage);
            const empty = width - filled;
            const bar = `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
            dom.logDisplay.value = `${UI_MESSAGES.LOADING_STATS}\n\n    ${bar} ${Math.round(
              percentage * 100,
            )}%\n    已读取: ${current} / ${total} 条`;
          },
          offset,
        );
        if (renderId !== currentRenderId) return;
        messages = result.messages;
      } else {
        // 核心渲染路径：检查 LRU 缓存
        if (viewCache.has(fetchPage)) {
          messages = viewCache.get(fetchPage); // 零延迟命中！
        } else {
          // 缓存未命中，执行完整 DB 提取生命周期
          dom.logDisplay.value = UI_MESSAGES.LOADING_PREPARE;
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (renderId !== currentRenderId) return;

          const result = await dataAdapter.getMessages(
            currentServer,
            selectedChannel,
            fetchPage,
            fetchSize,
            (current, total) => {
              if (renderId !== currentRenderId) return;
              const width = 20;
              const percentage = current / total;
              const filled = Math.round(width * percentage);
              const empty = width - filled;
              const bar = `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
              dom.logDisplay.value = `${UI_MESSAGES.LOADING_HISTORY}\n\n    ${bar} ${Math.round(percentage * 100)}%\n    已读取: ${current} / ${total} 条`;
            },
          );

          if (renderId !== currentRenderId) return;

          messages = result.messages;
          totalCount = result.total; // 确保一致性

          viewCache.setTotalCount(totalCount);
          viewCache.set(fetchPage, messages); // 存入缓存

          // 过渡状态
          dom.logDisplay.value = UI_MESSAGES.LOADING_BUILDING;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    }

    // 更新分页状态
    const newTotalPages = Math.ceil(totalCount / pageSize) || 1;
    uiState.setTotalPages(newTotalPages);

    // 自动吸附逻辑
    if (isLockedToBottom && viewMode === 'log' && newTotalPages > currentPage) {
      uiState.setPage(newTotalPages);
      if (viewCache.has(newTotalPages)) {
        messages = viewCache.get(newTotalPages);
      } else {
        const followResult = await dataAdapter.getMessages(
          currentServer,
          selectedChannel,
          newTotalPages,
          pageSize,
        );
        if (renderId !== currentRenderId) return;
        messages = followResult.messages;
        viewCache.set(newTotalPages, messages);
      }
    }

    if (renderId !== currentRenderId) return;

    const context = {
      serverList,
      channelList,
      channelCounts,
      messages,
      totalCount,
      selectedChannel, // 显式传递经过控制器校验的选中状态
    };

    // [Bridge] 同步数据到 Preact Signals，为即将到来的组件化供电
    serverListSig.value = serverList;
    channelListSig.value = channelList;
    channelCountsSig.value = channelCounts;
    currentMessages.value = messages;
    totalCountSig.value = totalCount;

    renderer.render(context, uiCallbacks);

    // [性能优化] 启动后台预加载
    if (viewMode === 'log' && currentServer && selectedChannel) {
      preloadAdjacentPages(currentPage, newTotalPages, currentServer, selectedChannel, pageSize);
    }
  };

  const ioManager = createIOManager({
    dom,
    dataAdapter,
    appCallbacks,
    refreshView: () => refreshView(),
  });

  const clearAllData = async () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      await storageManager.clearAllData();
      viewCache.clear();
      await appCallbacks.scanAndMergeHistory();
      refreshView();
    }
  };

  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
  };

  const recoverLegacyData = async (targetServer) => {
    try {
      // 修正接口名：dataAdapter.getRawState -> dataAdapter.getAllData
      const rawState = await dataAdapter.getAllData();
      const newState = await MigrationManager.recoverAndMergeAll(rawState, targetServer);
      await appCallbacks.saveMessagesToStorage(newState);
      alert('数据恢复合并完成！已自动清理旧版残留。');
    } catch (err) {
      console.error('[Recovery] Failed:', err);
      alert('恢复失败，详情请查看控制台。');
    }
  };

  const clearLegacyData = async () => {
    MigrationManager.clearAllLegacyData();
    alert('旧版残留数据已清理。');
  };

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

  await bindUIEvents({
    dom,
    uiState,
    refreshView,
    callbacks: uiCallbacks,
  });

  // 4. Initial Render
  // 必须等待首屏渲染完成，确保 UI 实例返回时 DOM 已就绪
  await refreshView();

  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        refreshView();
      }
    },
    onNewMessage: (msg) => {
      viewCache.pushNewMessage(msg);
    },
    invalidateCache: () => {
      viewCache.clear();
    },
    setState: (newState) => {
      refreshView();
    },
    checkStorageUsage: async () => await renderer.checkStorageUsage(),
    isUIPaused: () => uiState.getState().isUIPaused,
    getInitDebounceMs: () => uiState.getState().initDebounceMs,
    updateRecordingStatus: (serverName, channelName) => {
      uiState.setRecordingStatus(serverName, channelName);
      refreshView();
    },
  };
}
