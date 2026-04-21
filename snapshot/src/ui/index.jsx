import { storageManager } from '../storage/index.js';
import { MigrationManager } from '../migrations.js';
import { render } from 'preact';
import { App } from './App.jsx';
import { createIOManager } from './io-manager.js';
import { createUIState } from './state.js';
import { 
  serverList as serverListSig, 
  channelList as channelListSig, 
  channelCounts as channelCountsSig, 
  currentMessages, 
  totalCount as totalCountSig 
} from './store/dataStore.js';
import { 
  viewingServer as viewingServerSig,
  selectedChannel as selectedChannelSig,
  currentPage as currentPageSig,
  totalPages as totalPagesSig,
  viewMode as viewModeSig,
  pageSize as pageSizeSig,
  cachePages as cachePagesSig,
  isUIPaused
} from './store/uiStore.js';
import { ViewCache } from './view-cache.js';

/**
 * 初始化并编排整个 UI 模块 (Preact 架构)
 */
export async function createUI(dataAdapter, appCallbacks) {
  // 1. 初始化状态 (Signals)
  const uiState = await createUIState();
  const viewCache = new ViewCache();
  let currentRenderId = 0;

  // 2. 准备挂载容器
  let container = document.getElementById('log-archive-ui-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'log-archive-ui-container';
    document.body.appendChild(container);
  }

  // 3. 辅助逻辑：预加载
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

  /**
   * 核心控制器：异步刷新数据并推送到 Signals
   */
  const refreshView = async () => {
    const renderId = ++currentRenderId;
    
    // 获取当前状态快照
    const server = viewingServerSig.value;
    const page = currentPageSig.value;
    const size = pageSizeSig.value;
    const mode = viewModeSig.value;
    const channel = selectedChannelSig.value;

    const serverList = await dataAdapter.getServers();
    serverListSig.value = serverList;

    // 确定当前服务器
    if (!server && serverList.length > 0) {
      viewingServerSig.value = serverList[0];
    }
    const currentServer = viewingServerSig.value;
    if (!currentServer) return;

    // 获取频道信息
    const channels = await dataAdapter.getChannels(currentServer);
    channelListSig.value = channels;

    const counts = {};
    await Promise.all(channels.map(async (ch) => {
      counts[ch] = await dataAdapter.getChannelCount(currentServer, ch);
    }));
    channelCountsSig.value = counts;

    // 校验选中频道
    let targetChannel = channel;
    if (!targetChannel || !channels.includes(targetChannel)) {
      targetChannel = channels[0];
      selectedChannelSig.value = targetChannel;
    }

    // 获取消息
    const total = counts[targetChannel] || 0;
    const totalPages = Math.ceil(total / size) || 1;
    totalPagesSig.value = totalPages;

    viewCache.init(currentServer, targetChannel, size, cachePagesSig.value);
    viewCache.setTotalCount(total);

    if (mode === 'log') {
      if (viewCache.has(page)) {
        currentMessages.value = viewCache.get(page);
      } else {
        const result = await dataAdapter.getMessages(currentServer, targetChannel, page, size);
        if (renderId === currentRenderId) {
          currentMessages.value = result.messages;
          viewCache.set(page, result.messages);
        }
      }
      // 预加载
      preloadAdjacentPages(page, totalPages, currentServer, targetChannel, size);
    }
  };

  // 4. IO 与 回调
  const ioManager = createIOManager({ 
    dom: {}, // IOManager 内部现在主要靠 navigator.clipboard，不再强依赖 dom 对象
    dataAdapter, 
    appCallbacks, 
    refreshView 
  });

  const uiCallbacks = {
    ...appCallbacks,
    ...ioManager,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    clearAllData: async () => {
      if (confirm('【严重警告】将清空所有存档！确定吗？')) {
        appCallbacks.deactivateLogger();
        await storageManager.clearAllData();
        viewCache.clear();
        await appCallbacks.scanAndMergeHistory();
        refreshView();
      }
    },
    recoverLegacyData: async (target) => {
      const raw = await dataAdapter.getAllData();
      const newState = await MigrationManager.recoverAndMergeAll(raw, target);
      await appCallbacks.saveMessagesToStorage(newState);
      refreshView();
    },
    clearLegacyData: async () => {
      MigrationManager.clearAllLegacyData();
      refreshView();
    }
  };

  // 5. 挂载 Preact
  render(<App dataAdapter={dataAdapter} appCallbacks={uiCallbacks} />, container);

  // 6. 初始加载
  await refreshView();

  // 7. 返回 Public API
  return {
    updateUI: async () => {
      if (!isUIPaused.value) await refreshView();
    },
    onNewMessage: (msg) => {
      viewCache.pushNewMessage(msg);
      // 如果正在看最后一页，由于信号自动绑定，UI 会由于 viewCache.pages 改变而响应吗？
      // 不，我们还需要手动触发展示信号的更新
      if (currentPageSig.value === totalPagesSig.value) {
        currentMessages.value = [...viewCache.get(currentPageSig.value)];
      }
    },
    invalidateCache: () => viewCache.clear(),
    checkStorageUsage: async () => {}, // Preact 组件内部自处理
    isUIPaused: () => isUIPaused.value,
    getInitDebounceMs: () => uiState.getInitDebounceMs(),
    updateRecordingStatus: async (server, channel) => {
      uiState.setRecordingStatus(server, channel);
      await refreshView();
    }
  };
}