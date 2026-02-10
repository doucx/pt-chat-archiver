import { STORAGE_KEY_V5 } from '../constants.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
import { createRenderer, formatMessageForDisplay } from './renderer.js';
import { createUIState } from './state.js';

/**
 * Initializes and orchestrates the entire UI module.
 * @param {object} initialAppState - The initial application state (inMemoryChatState).
 * @param {object} appCallbacks - Callbacks for application-level actions.
 * @returns {object} Public API for the UI module.
 */
export function createUI(initialAppState, appCallbacks) {
  const appState = initialAppState;

  // 1. Initialize DOM structure
  initDOM(__APP_VERSION__);
  const dom = getDOMElements();

  // 2. Create state and renderer instances
  const uiState = createUIState();
  const renderer = createRenderer(dom, uiState);

  // 3. Prepare callbacks and bind events
  const getAppState = () => appState;

  const downloadAllData = () => {
    if (Object.keys(appState).length === 0) return;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const baseFilename = `pt-saver-${timestamp}`;
    let allTextContent = '';
    for (const channelName in appState) {
      allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
      allTextContent += appState[channelName].map(formatMessageForDisplay).join('\n');
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

  const cleanChannelRecords = () => {
    const duplicateCount = appCallbacks.detectTotalDuplicates(appState);
    if (duplicateCount === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${duplicateCount} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const channel in appState) {
        const { cleanedRecords } = appCallbacks.cleanChannelRecords(appState[channel]);
        appState[channel] = cleanedRecords;
      }
      appCallbacks.saveMessagesToStorage(appState);
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        renderer.render(appState, uiCallbacks); // Re-render to update button
      }, 2000);
    }
  };

  const clearAllData = () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      storage.clear(); // 使用抽象层清空数据
      for (const key of Object.keys(appState)) {
        delete appState[key];
      }
      // 重置后不应立即扫描合并，而是保持空状态或由用户决定
      renderer.render(appState, uiCallbacks);
    }
  };

  const uiCallbacks = {
    ...appCallbacks,
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    downloadAllData,
  };

  bindUIEvents({
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
    checkStorageUsage: renderer.checkStorageUsage,
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: renderer.updateServerDisplay,
  };
}
