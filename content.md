你的分析非常敏锐，当前的“一键下载两种格式”确实不符合大多数工具的交互直觉，且在设置页面的宽裕空间下，将它们拆分并提供对称的“复制”功能会极大提升易用性。

我将执行以下操作：
1.  **重构 UI 模板**：在设置页面中拆分下载和复制按钮，形成“复制 JSON/TXT”和“下载 JSON/TXT”的对称布局。
2.  **提取导出逻辑**：将原有的 `downloadAllData` 拆分为独立的 `downloadJSON`、`downloadTXT` 逻辑，并实现 `copyTXT`。
3.  **更新事件绑定**：确保新的按钮能够触发对应的操作。

## [WIP] feat(ui): 拆分 JSON 与 TXT 的导出和下载功能

### 用户需求
1.  **功能拆分**：将现有的“下载备份”功能拆分为独立的“下载 JSON”和“下载 TXT”。
2.  **文案改进**：将“导出 JSON”更名为“复制 JSON”。
3.  **功能对称**：新增“复制 TXT”功能，与“复制 JSON”对应。
4.  **布局优化**：利用设置页面的空间提供更清晰的导出控制。

### 评论
这是一个显著提升用户体验 (UX) 的改动。之前的全量下载会造成浏览器弹出多个下载提示，对只想获取特定格式的用户不够友好。对称的复制/下载矩阵让导出操作更加直观且灵活。

### 目标
1.  修改 `src/ui/templates.js` 调整 HTML 结构。
2.  修改 `src/ui/dom.js` 缓存新的按钮引用。
3.  修改 `src/ui/index.js` 重构导出逻辑函数。
4.  修改 `src/ui/events.js` 绑定新的交互事件。

### 基本原理
通过在 `createUI` 中定义更细粒度的导出函数（`copyTXT`, `downloadJSON`, `downloadTXT` 等），并将其映射到 UI 上的四个独立按钮。逻辑上，我们将原本耦合在 `downloadAllData` 中的格式化逻辑提取出来，以便在“下载”和“复制”功能间共享。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/export-controls #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 更新 UI 模板结构

我们将调整维护操作区域的布局。

~~~~~act
write_file
src/ui/templates.js
~~~~~
~~~~~javascript
/**
 * 返回 UI 主容器的 HTML 结构。
 * @param {string} version - 应用程序版本号。
 * @returns {string}
 */
export const getMainContainerHTML = (version) => `
    <div id="log-archive-ui-header">
        <div id="log-archive-ui-controls" style="width: 100%; justify-content: space-between;">
            <select id="log-archive-channel-selector" class="log-archive-ui-button" style="flex-grow: 1; margin-right: 10px;"></select>
            <div style="display: flex; gap: 5px;">
                <button id="log-archive-main-reset-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="display: none;">📍</button>
                <button id="log-archive-pause-button" class="log-archive-ui-button" title="暂停/恢复录制">⏸️ </button>
                <button id="log-archive-stats-button" class="log-archive-ui-button" title="数据统计">📊</button>
                <button id="log-archive-settings-button" class="log-archive-ui-button" title="设置">⚙️</button>
                <button id="log-archive-copy-button" class="log-archive-ui-button" title="复制当前页内容">📋</button>
                <button id="log-archive-close-button" class="log-archive-ui-button" title="关闭界面">❌</button>
            </div>
        </div>
    </div>
    
    <div id="log-archive-view-container" style="flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
        <!-- 记录查看视图 -->
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-readonly-indicator" class="readonly-pill">只读存档模式</div>
            <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
                <button id="page-first" class="log-archive-ui-button">«</button>
                <button id="page-prev" class="log-archive-ui-button">‹</button>
                <span id="page-info" class="info-text-primary"></span>
                <button id="page-next" class="log-archive-ui-button">›</button>
                <button id="page-last" class="log-archive-ui-button">»</button>
            </div>
            <textarea id="log-archive-ui-log-display" readonly style="margin-top: 10px; flex-grow: 1;"></textarea>
        </div>

        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <!-- 元信息展示区 -->
            <div style="border-bottom: 1px solid var(--color-border); padding-bottom: 15px; margin-bottom: 5px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <h3 style="margin: 0; color: var(--color-primary); font-size: 1.1em;">PT Chat Archiver</h3>
                    <span class="info-text-dim" style="font-size: 0.8em;">v${version}</span>
                </div>
                <div id="log-archive-server-status" style="margin-top: 8px; font-size: 0.85em;">
                    检测中...
                </div>
            </div>

            <div class="config-group">
                <label for="log-archive-server-view-selector">查看存档服务器</label>
                <div class="config-input-row">
                    <select id="log-archive-server-view-selector" class="log-archive-ui-button" style="flex-grow: 1; min-width: 0;"></select>
                    <button id="log-archive-reset-server-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="flex-shrink: 0;">📍</button>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                    <input type="checkbox" id="log-archive-auto-follow-input" style="width: auto; margin: 0;">
                    <label for="log-archive-auto-follow-input" style="font-weight: normal; color: var(--color-text-dim); font-size: 0.85em; cursor: pointer;">跟随游戏服务器切换</label>
                </div>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    切换查看不同服务器的历史记录。注意：此切换仅影响显示，不影响当前的数据录制。
                </div>
            </div>
            <div class="config-group">
                <label for="log-archive-self-name-input">用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label for="log-archive-page-size-input">分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label for="log-archive-auto-save-interval">自动保存间隔 (秒)</label>
                <input type="number" id="log-archive-auto-save-interval" min="5" max="3600" step="5">
            </div>
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" class="info-text-dim" style="margin-bottom: 2px;"></div>
                <div id="log-archive-config-msg-count" class="info-text-dim" style="margin-bottom: 8px;"></div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button id="log-archive-save-now-button" class="log-archive-ui-button" style="flex-grow: 1;">💾 立即保存</button>
                        <span id="log-archive-last-saved-info" class="info-text-dim" style="font-size: 0.8em; white-space: nowrap;">未保存</span>
                    </div>
                    
                    <div class="config-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button id="log-archive-copy-json-button" class="log-archive-ui-button">复制 JSON</button>
                        <button id="log-archive-copy-txt-button" class="log-archive-ui-button">复制 TXT</button>
                        <button id="log-archive-download-json-button" class="log-archive-ui-button">下载 JSON</button>
                        <button id="log-archive-download-txt-button" class="log-archive-ui-button">下载 TXT</button>
                    </div>

                    <div class="config-actions" style="display: flex; gap: 8px;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">清理重复</button>
                        <button id="log-archive-import-button" class="log-archive-ui-button" style="flex-grow: 1;">📥 导入存档</button>
                    </div>
                </div>
            </div>
            <div id="log-archive-legacy-recovery-group" class="config-group" style="margin-top: 10px; display: none; padding: 10px; background: rgba(200, 150, 50, 0.1); border: 1px dashed var(--color-warning);">
                <label style="color: var(--color-warning);">发现残留数据!</label>
                <div id="log-archive-legacy-info" class="info-text-dim" style="margin-bottom: 8px;">
                    检测到旧版本 (v4/v5/v6) 的聊天记录尚未合并到当前数据库。
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="log-archive-recover-button" class="log-archive-ui-button" style="background-color: var(--color-warning); color: #000; flex-grow: 1;">尝试合并旧数据</button>
                    <button id="log-archive-ignore-legacy-button" class="log-archive-ui-button" style="background-color: var(--color-danger); color: #fff; flex-grow: 1;">放弃并清理</button>
                </div>
                <div class="info-text-dim" style="margin-top: 6px; font-size: 0.8em;">
                    此操作将把 localStorage 中的旧记录合并到当前存档的开头，并自动处理重复项。
                </div>
            </div>

            <div id="log-archive-delete-backup-group" class="config-group" style="margin-top: auto; display: none;">
                <label>兼容性清理</label>
                <button id="log-archive-delete-backup-button" class="log-archive-ui-button">删除旧版 LocalStorage 备份</button>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    迁移至新数据库后生成的备份文件，删除可释放浏览器 LocalStorage 空间。
                </div>
            </div>

            <div class="config-group" style="margin-top: 10px; border-top: 1px dashed #444; padding-top: 20px;">
                <label style="color: #ff6666;">危险操作</label>
                <button id="log-archive-clear-button" class="log-archive-ui-button">清空所有本地存档</button>
            </div>
        </div>
    </div>
`;

export const TOGGLE_BUTTON_ICON = '📜';
~~~~~

#### Acts 2: 更新 DOM 元素引用

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    lastSavedInfo: document.getElementById('log-archive-last-saved-info'),
    saveNowButton: document.getElementById('log-archive-save-now-button'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
    configMsgCount: document.getElementById('log-archive-config-msg-count'),
    legacyRecoveryGroup: document.getElementById('log-archive-legacy-recovery-group'),
    legacyInfoText: document.getElementById('log-archive-legacy-info'),
    recoverButton: document.getElementById('log-archive-recover-button'),
    ignoreLegacyButton: document.getElementById('log-archive-ignore-legacy-button'),
    deleteBackupGroup: document.getElementById('log-archive-delete-backup-group'),
    deleteBackupButton: document.getElementById('log-archive-delete-backup-button'),
    cleanButton: document.getElementById('log-archive-clean-button'),
    copyAllButton: document.getElementById('log-archive-copy-all-button'),
    importButton: document.getElementById('log-archive-import-button'),
    clearButton: document.getElementById('log-archive-clear-button'),
~~~~~
~~~~~javascript.new
    lastSavedInfo: document.getElementById('log-archive-last-saved-info'),
    saveNowButton: document.getElementById('log-archive-save-now-button'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
    configMsgCount: document.getElementById('log-archive-config-msg-count'),
    legacyRecoveryGroup: document.getElementById('log-archive-legacy-recovery-group'),
    legacyInfoText: document.getElementById('log-archive-legacy-info'),
    recoverButton: document.getElementById('log-archive-recover-button'),
    ignoreLegacyButton: document.getElementById('log-archive-ignore-legacy-button'),
    deleteBackupGroup: document.getElementById('log-archive-delete-backup-group'),
    deleteBackupButton: document.getElementById('log-archive-delete-backup-button'),
    cleanButton: document.getElementById('log-archive-clean-button'),
    copyJsonButton: document.getElementById('log-archive-copy-json-button'),
    copyTxtButton: document.getElementById('log-archive-copy-txt-button'),
    downloadJsonButton: document.getElementById('log-archive-download-json-button'),
    downloadTxtButton: document.getElementById('log-archive-download-txt-button'),
    importButton: document.getElementById('log-archive-import-button'),
    clearButton: document.getElementById('log-archive-clear-button'),
~~~~~

#### Acts 3: 重构导出逻辑

我们将 `downloadAllData` 拆分，并新增 `copyTxtData` 等回调。

~~~~~act
write_file
src/ui/index.js
~~~~~
~~~~~javascript
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

  const clearLegacyData = async () => {
    MigrationManager.clearAllLegacyData();
    alert('旧版残留数据已清理。');
  };

  const uiCallbacks = {
    ...appCallbacks,
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

#### Acts 4: 绑定新事件

我们需要移除旧的 `copyAllButton` 和 `downloadButton` 监听器，并添加四个新的导出监听器。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.copyButton.addEventListener('click', () => {
    if (dom.logDisplay.value) {
      navigator.clipboard.writeText(dom.logDisplay.value).then(() => {
        const originalText = dom.copyButton.textContent;
        dom.copyButton.textContent = '✅';
        setTimeout(() => {
          dom.copyButton.textContent = originalText;
        }, UI_FEEDBACK_DURATION);
      });
    }
  });

  dom.copyAllButton.addEventListener('click', () => {
    callbacks.copyAllData();
    const originalText = dom.copyAllButton.textContent;
    dom.copyAllButton.textContent = '已复制 JSON!';
    setTimeout(() => {
      dom.copyAllButton.textContent = originalText;
    }, UI_FEEDBACK_DURATION);
  });

  dom.importButton.addEventListener('click', () => {
    callbacks.importAllData();
  });

  dom.downloadButton.addEventListener('click', () => callbacks.downloadAllData());
~~~~~
~~~~~javascript.new
  dom.copyButton.addEventListener('click', () => {
    if (dom.logDisplay.value) {
      navigator.clipboard.writeText(dom.logDisplay.value).then(() => {
        const originalText = dom.copyButton.textContent;
        dom.copyButton.textContent = '✅';
        setTimeout(() => {
          dom.copyButton.textContent = originalText;
        }, UI_FEEDBACK_DURATION);
      });
    }
  });

  dom.copyJsonButton.addEventListener('click', () => {
    callbacks.copyJSON();
    const originalText = dom.copyJsonButton.textContent;
    dom.copyJsonButton.textContent = '✅ 已复制 JSON';
    setTimeout(() => {
      dom.copyJsonButton.textContent = originalText;
    }, UI_FEEDBACK_DURATION);
  });

  dom.copyTxtButton.addEventListener('click', () => {
    callbacks.copyTXT();
    const originalText = dom.copyTxtButton.textContent;
    dom.copyTxtButton.textContent = '✅ 已复制 TXT';
    setTimeout(() => {
      dom.copyTxtButton.textContent = originalText;
    }, UI_FEEDBACK_DURATION);
  });

  dom.downloadJsonButton.addEventListener('click', () => {
    callbacks.downloadJSON();
  });

  dom.downloadTxtButton.addEventListener('click', () => {
    callbacks.downloadTXT();
  });

  dom.importButton.addEventListener('click', () => {
    callbacks.importAllData();
  });
~~~~~

### 下一步建议
- **回归测试**：点击各个导出的“复制”和“下载”按钮，确保数据格式正确且下载文件名符合预期。
- **UI 润色**：检查设置页面中的按钮布局是否在不同屏幕尺寸下都能保持良好的 grid 布局（目前使用了 CSS Grid）。
- **提交变更**：验证通过后，将此 UX 改进进行 commit。
