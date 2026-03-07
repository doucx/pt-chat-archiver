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

      const result = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        fetchPage,
        fetchSize,
      );
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
      totalCount,
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

  const clearLegacyData = async () => {
    MigrationManager.clearAllLegacyData();
    alert('旧版残留数据已清理。');
  };

  const uiCallbacks = {
    ...appCallbacks,
    getRawState: dataAdapter.getRawState, // 必须提供给分析模块
    cleanChannelRecords,
    clearAllData,
    importAllData,
    deleteV6Backup,
    recoverLegacyData,
    clearLegacyData,
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
