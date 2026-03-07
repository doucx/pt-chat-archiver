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

  const downloadAllData = () => {
    if (Object.keys(appState).length === 0) return;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const baseFilename = `pt-saver-${timestamp}`;
    let allTextContent = '';

    // V6 结构: appState[serverName][channelName]
    for (const serverName in appState) {
      allTextContent += '\n\n############################################################\n';
      allTextContent += `## 服务器: ${serverName}\n`;
      allTextContent += '############################################################\n';

      const serverData = appState[serverName];
      for (const channelName in serverData) {
        allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
        const messages = serverData[channelName];
        if (Array.isArray(messages)) {
          allTextContent += messages.map(formatMessageForDisplay).join('\n');
        }
      }
    }

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
    triggerDownload(JSON.stringify(appState, null, 2), `${baseFilename}.json`, 'application/json');
    triggerDownload(allTextContent.trim(), `${baseFilename}.txt`, 'text/plain');
  };

  const copyAllData = () => {
    const messages = JSON.stringify(appState, null, 2);
    navigator.clipboard.writeText(messages);
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

    // 必须直接响应用户操作触发 click，不能有 alert/confirm 阻断
    input.click();
  };

  const cleanChannelRecords = async () => {
    // 兼容 V6 结构的重复检测
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
        renderer.render(appState, uiCallbacks); // Re-render to update button
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
      await appCallbacks.scanAndMergeHistory(); // This will repopulate appState
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

      // 1. 更新全局引用
      if (appCallbacks.replaceState) {
        appCallbacks.replaceState(newState);
      }
      appState = newState;

      // 2. 立即持久化到 v7 (IndexedDB)
      await appCallbacks.saveMessagesToStorage(appState);

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
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    importAllData,
    downloadAllData,
    deleteV6Backup,
    recoverLegacyData,
    clearLegacyData,
  };

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
