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
  // 1. Initialize DOM structure
  initDOM(__APP_VERSION__);
  const dom = getDOMElements();

  // 2. Create state and renderer instances
  const uiState = await createUIState();
  const renderer = createRenderer(dom, uiState);

  let currentRenderId = 0;

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
      viewMode,
      isLockedToBottom,
      selectedChannel: stateChannel,
    } = uiState.getState();
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

    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      // 渲染非阻塞化：显示加载骨架状态并让出主线程，允许浏览器重绘
      dom.logDisplay.value = '⏳ 数据加载与处理中...';
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (renderId !== currentRenderId) return; // 竞态控制：丢弃过期的渲染请求

      // 如果是 stats 模式，可能需要全量数据 (Phase 1 临时兼容)
      const fetchSize = viewMode === 'stats' ? 999999 : pageSize;
      const fetchPage = viewMode === 'stats' ? 1 : currentPage;

      const result = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        fetchPage,
        fetchSize,
      );

      if (renderId !== currentRenderId) return;

      messages = result.messages;
      totalCount = result.total; // 确保一致性
    }

    // 更新分页状态
    const newTotalPages = Math.ceil(totalCount / pageSize);
    uiState.setTotalPages(newTotalPages);

    // 自动吸附逻辑: 如果处于锁定底部模式，且当前页面不是最后一页（说明产生了新数据导致翻页），
    // 强制将状态更新为最后一页，并重新获取该页数据。
    if (isLockedToBottom && viewMode === 'log' && newTotalPages > currentPage) {
      uiState.setPage(newTotalPages);
      const followResult = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        newTotalPages,
        pageSize,
      );
      if (renderId !== currentRenderId) return;
      messages = followResult.messages;
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

    renderer.render(context, uiCallbacks);
  };

  // --- Export Helper Functions ---

  const getExportTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  };

  const generateFullTextExport = (state) => {
    let allTextContent = '';
    // V6 结构: state[serverName][channelName]
    for (const serverName in state) {
      allTextContent += '\n\n############################################################\n';
      allTextContent += `## 服务器: ${serverName}\n`;
      allTextContent += '############################################################\n';

      const serverData = state[serverName];
      for (const channelName in serverData) {
        allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
        const messages = serverData[channelName];
        if (Array.isArray(messages)) {
          allTextContent += messages.map(formatMessageForDisplay).join('\n');
        }
      }
    }
    return allTextContent.trim();
  };

  const triggerDownload = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
            // 持久化覆盖
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

  const importAndMergeData = () => {
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

          if (
            typeof importedData !== 'object' ||
            importedData === null ||
            Array.isArray(importedData)
          ) {
            throw new Error('无效的存档格式。');
          }

          const serverCount = Object.keys(importedData).length;
          const msg = `准备合并文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n系统将自动跳过重复记录。是否继续？`;

          if (confirm(msg)) {
            dom.importMergeButton.disabled = true;
            dom.importMergeButton.textContent = '正在合并...';

            await appCallbacks.mergeMessagesToStorage(importedData);

            dom.importMergeButton.textContent = '✅ 合并成功';
            setTimeout(() => {
              dom.importMergeButton.disabled = false;
              dom.importMergeButton.textContent = '导入并合并 JSON (推荐)';
            }, UI_FEEDBACK_DURATION);

            refreshView();
          }
        } catch (err) {
          console.error('[Archiver] Merge failed:', err);
          alert(`合并失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };

    input.click();
  };

  const clearAllData = async () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      await storageManager.clearAllData();
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
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    deleteMessages: appCallbacks.deleteMessages,
    clearAllData,
    importAllData,
    deleteV6Backup,
    recoverLegacyData,
    clearLegacyData,
    importAndMergeData,
    downloadJSON,
    downloadTXT,
    copyJSON,
    copyTXT,
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
