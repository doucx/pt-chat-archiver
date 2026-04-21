## [WIP] refactor(ui): 彻底移除 Vanilla JS 渲染引擎，由 Preact 全面接管 UI

### 用户需求
进入 Phase 4，彻底移除旧的 `renderer.js`, `templates.js`, `events.js`, `dom.js` 以及旧状态门面 `state.js`。将所有的依赖汇聚到 Preact 树中，实现 100% 的现代化组件架构。

### 评论
我们已经走过了漫长但稳健的重构之路。在这个计划中，我们将抛弃所有沉重的包袱。不再有手动操作的 DOM `innerHTML`，不再有容易导致内存泄漏的手动事件绑定，不再有复杂的由于 UI 过渡引起的锁问题。整个系统将变得极其简洁，完全由数据流驱动。

### 目标
1. 移除 `App.jsx` 中的 `IS_PREACT_READY` 开关。
2. 将 `formatMessageForDisplay` 迁移到 `utils.js` 中以便共享。
3. 更新 `uiStore.js` 和 `io-manager.js`，彻底移除它们对 `dom.js` 或旧模块的依赖。
4. 重写 `index.jsx`，以 Signals 为核心重构数据拉取和绑定流。
5. 安全地删除被完全废弃的 5 个旧版文件。

### 基本原理
借助 `@preact/signals`，我们在 `index.jsx` 中只需要关注如何拉取数据并赋值给 `currentMessages.value`，底层的 UI 重绘将被框架无缝、高效地接管。同时，我们通过向 Signals 引入 `loadingMessage` 来优雅地处理大文件拉取时的“进度条更新”，这避免了在异步流中对 DOM 文本域进行不安全的脏写。

### 标签
#intent/refine #flow/ready #priority/high #comp/ui #concept/ui #scope/ui #ai/instruct #task/domain/ui #task/object/preact-migration #task/action/finalize #task/state/end

---

### Script

#### Acts 1: 迁移数据格式化工具

将 `formatMessageForDisplay` 从即将被删除的 `renderer.js` 移动到全局通用的 `utils.js` 中。

~~~~~act
patch_file
src/utils.js
~~~~~
~~~~~javascript.old
export function formatISOTimeForDisplay(isoString) {
~~~~~
~~~~~javascript.new
export function formatMessageForDisplay(msg) {
  let prefix = '';
  const type = msg.type || '';
  if (type.includes('party')) prefix = '👥 ';
  else if (type.includes('whisper')) prefix = '💬 ';
  else if (type.includes('announcement')) prefix = '📣 ';
  const displayTime = formatISOTimeForDisplay(msg.time);
  return `${displayTime} ${prefix}${msg.content}`;
}

export function formatISOTimeForDisplay(isoString) {
~~~~~

#### Acts 2: 完善 uiStore 的导出

向全局状态中添加控制加载显示的信号，以及合并服务器状态录制的逻辑。

~~~~~act
patch_file
src/ui/store/uiStore.js
~~~~~
~~~~~javascript.old
export const cachePages = signal(5);
export const autoFollowServer = signal(true);
export const selfName = signal('');

// --- 派生状态 (Computed) ---
~~~~~
~~~~~javascript.new
export const cachePages = signal(5);
export const autoFollowServer = signal(true);
export const selfName = signal('');
export const loadingMessage = signal('');

// --- 派生状态 (Computed) ---
~~~~~
~~~~~act
patch_file
src/ui/store/uiStore.js
~~~~~
~~~~~javascript.old
  if (signalMap[key]) {
    signalMap[key].value = value;
    await storageManager.saveConfig({
      pageSize: pageSize.value,
      statsLimit: statsLimit.value,
      readChunkSize: readChunkSize.value,
      initDebounceMs: initDebounceMs.value,
      cachePages: cachePages.value,
      autoFollowServer: autoFollowServer.value
    });
  }
};
~~~~~
~~~~~javascript.new
  if (signalMap[key]) {
    signalMap[key].value = value;
    await storageManager.saveConfig({
      pageSize: pageSize.value,
      statsLimit: statsLimit.value,
      readChunkSize: readChunkSize.value,
      initDebounceMs: initDebounceMs.value,
      cachePages: cachePages.value,
      autoFollowServer: autoFollowServer.value
    });
  }
};

export const setRecordingStatus = (serverName, channelName) => {
  activeServer.value = serverName;
  recordedChannel.value = channelName;
  if (serverName) {
    lastServer.value = serverName;
    storageManager.setLastServer(serverName);
  }
  if (autoFollowServer.value || !viewingServer.value) {
    viewingServer.value = serverName;
  }
};
~~~~~

#### Acts 3: 改造组件：接入信号与内部状态机

让 `LogViewer` 接驳加载信号，并在 `ConfigPanel` 中完成独立的“扫描清理重复”的状态机闭环。

~~~~~act
patch_file
src/ui/components/LogViewer.jsx
~~~~~
~~~~~javascript.old
import { useMemo, useRef, useEffect } from 'preact/hooks';
import { currentMessages } from '../store/dataStore';
import { selectedChannel, isReadOnly, isLockedToBottom, currentPage, totalPages, isUIPaused } from '../store/uiStore';
import { UI_MESSAGES } from '../../constants.js';
import { formatMessageForDisplay } from '../renderer.js';
import { Pagination } from './Pagination';
~~~~~
~~~~~javascript.new
import { useMemo, useRef, useEffect } from 'preact/hooks';
import { currentMessages } from '../store/dataStore';
import { selectedChannel, isReadOnly, isLockedToBottom, currentPage, totalPages, isUIPaused, loadingMessage } from '../store/uiStore';
import { UI_MESSAGES } from '../../constants.js';
import { formatMessageForDisplay } from '../../utils.js';
import { Pagination } from './Pagination';
~~~~~
~~~~~act
patch_file
src/ui/components/LogViewer.jsx
~~~~~
~~~~~javascript.old
  const handleScroll = (e) => {
    const el = e.target;
    if (displayText.startsWith('⏳')) return;

    const threshold = 10;
~~~~~
~~~~~javascript.new
  const handleScroll = (e) => {
    const el = e.target;
    if (el.value.startsWith('⏳') || loadingMessage.value) return;

    const threshold = 10;
~~~~~
~~~~~act
patch_file
src/ui/components/LogViewer.jsx
~~~~~
~~~~~javascript.old
      <textarea 
        ref={textareaRef}
        id="log-archive-ui-log-display" 
        readOnly 
        style={{ marginTop: '10px', flexGrow: 1 }}
        value={displayText}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
      />
~~~~~
~~~~~javascript.new
      <textarea 
        ref={textareaRef}
        id="log-archive-ui-log-display" 
        readOnly 
        style={{ marginTop: '10px', flexGrow: 1 }}
        value={loadingMessage.value || displayText}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
      />
~~~~~
~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
  const handleSelfNameChange = async (e) => {
    const val = e.target.value.trim();
    selfName.value = val;
    await storageManager.setSelfName(val);
  };

  return (
    <div id="log-archive-config-view" class="config-section">
~~~~~
~~~~~javascript.new
  const handleSelfNameChange = async (e) => {
    const val = e.target.value.trim();
    selfName.value = val;
    await storageManager.setSelfName(val);
  };

  const [scanState, setScanState] = useState('idle');
  const [duplicateIds, setDuplicateIds] = useState([]);

  const handleScanDuplicates = async () => {
    if (scanState === 'idle' || scanState === 'done') {
      setScanState('scanning');
      try {
        const ids = await callbacks.scanDuplicates();
        if (ids.length === 0) {
          setScanState('done');
          setTimeout(() => setScanState('idle'), 1500);
        } else {
          setDuplicateIds(ids);
          setScanState('pending');
        }
      } catch (e) {
        setScanState('idle');
      }
    } else if (scanState === 'pending') {
      if (confirm(`【确认】将删除 ${duplicateIds.length} 条重复记录。此操作不可逆。确定要继续吗？`)) {
        setScanState('cleaning');
        await callbacks.deleteMessages(duplicateIds);
        setScanState('done');
        setDuplicateIds([]);
        setTimeout(() => setScanState('idle'), 1500);
      }
    }
  };

  return (
    <div id="log-archive-config-view" class="config-section">
~~~~~
~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button class="log-archive-ui-button" onClick={callbacks.copyJSON}>复制 JSON</button>
            <button class="log-archive-ui-button" onClick={callbacks.copyTXT}>复制 TXT</button>
            <button class="log-archive-ui-button" onClick={callbacks.downloadJSON}>下载 JSON</button>
            <button class="log-archive-ui-button" onClick={callbacks.downloadTXT}>下载 TXT</button>
          </div>
          <button class="log-archive-ui-button" style={{ backgroundColor: 'var(--color-success)' }} onClick={callbacks.importAndMergeData}>导入 JSON (合并)</button>
        </div>
      </div>
~~~~~
~~~~~javascript.new
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button class="log-archive-ui-button" onClick={callbacks.copyJSON}>复制 JSON</button>
            <button class="log-archive-ui-button" onClick={callbacks.copyTXT}>复制 TXT</button>
            <button class="log-archive-ui-button" onClick={callbacks.downloadJSON}>下载 JSON</button>
            <button class="log-archive-ui-button" onClick={callbacks.downloadTXT}>下载 TXT</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button class={`log-archive-ui-button ${scanState === 'pending' ? 'active' : ''}`} onClick={handleScanDuplicates} disabled={scanState === 'scanning' || scanState === 'cleaning'}>
              {scanState === 'idle' ? '扫描重复记录' : 
               scanState === 'scanning' ? '扫描中...' : 
               scanState === 'pending' ? `清理重复 (${duplicateIds.length})` : 
               scanState === 'cleaning' ? '清理中...' : 
               '清理完毕!'}
            </button>
            <button class="log-archive-ui-button" onClick={callbacks.importAllData}>导入 JSON (覆盖)</button>
            <button class="log-archive-ui-button" style={{ gridColumn: 'span 2', backgroundColor: 'var(--color-success)' }} onClick={callbacks.importAndMergeData}>导入 JSON (合并)</button>
          </div>
        </div>
      </div>
~~~~~

#### Acts 4: 移除过度特性开关

~~~~~act
patch_file
src/ui/App.jsx
~~~~~
~~~~~javascript.old
  // [重构开关]: 临时禁用 Preact 渲染，避免在过渡期与旧版 Vanilla DOM 发生冲突并破坏集成测试。
  // 在完成 ConfigPanel 和 StatsView 的重构，并准备好移除 templates.js 之前，请保持为 false。
  const IS_PREACT_READY = false;

  if (!IS_PREACT_READY) {
    return null;
  }

  return (
    <div 
      className={`log-archive-app-root ${isReadOnly.value ? 'is-readonly' : ''}`}
~~~~~
~~~~~javascript.new
  return (
    <div 
      className={`log-archive-app-root ${isReadOnly.value ? 'is-readonly' : ''}`}
~~~~~

#### Acts 5: 解除对 DOM 的依赖并重写 io-manager 和 index.jsx

~~~~~act
write_file
src/ui/io-manager.js
~~~~~
~~~~~javascript
import { formatMessageForDisplay } from '../utils.js';

export function createIOManager({ dataAdapter, appCallbacks, refreshView }) {
  const getExportTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  };

  const generateFullTextExport = (state) => {
    let allTextContent = '';
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

  const downloadJSON = async () => {
    const allData = await dataAdapter.getAllData();
    if (Object.keys(allData).length === 0) return;
    triggerDownload(JSON.stringify(allData, null, 2), `pt-saver-${getExportTimestamp()}.json`, 'application/json');
  };

  const downloadTXT = async () => {
    const allData = await dataAdapter.getAllData();
    if (Object.keys(allData).length === 0) return;
    const text = generateFullTextExport(allData);
    triggerDownload(text, `pt-saver-${getExportTimestamp()}.txt`, 'text/plain');
  };

  const copyJSON = async () => {
    const allData = await dataAdapter.getAllData();
    navigator.clipboard.writeText(JSON.stringify(allData, null, 2));
    alert('✅ 已复制 JSON');
  };

  const copyTXT = async () => {
    const allData = await dataAdapter.getAllData();
    navigator.clipboard.writeText(generateFullTextExport(allData));
    alert('✅ 已复制 TXT');
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
          if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
            throw new Error('无效的存档格式：根节点必须是一个对象。');
          }

          const serverCount = Object.keys(importedData).length;
          const warning = `准备导入文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n【严重警告】\n此操作将完全清空并覆盖当前浏览器的所有本地存档！\n确定要继续吗？`;

          if (confirm(warning)) {
            await appCallbacks.saveMessagesToStorage(importedData);
            alert('✅ 导入成功');
            refreshView();
          }
        } catch (err) {
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
          if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
            throw new Error('无效的存档格式。');
          }

          const serverCount = Object.keys(importedData).length;
          const msg = `准备合并文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n系统将自动跳过重复记录。是否继续？`;

          if (confirm(msg)) {
            await appCallbacks.mergeMessagesToStorage(importedData);
            alert('✅ 合并成功');
            refreshView();
          }
        } catch (err) {
          alert(`合并失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return {
    downloadJSON,
    downloadTXT,
    copyJSON,
    copyTXT,
    importAllData,
    importAndMergeData,
  };
}
~~~~~
~~~~~act
write_file
src/ui/index.jsx
~~~~~
~~~~~javascript
import { render } from 'preact';
import { App } from './App.jsx';
import { createIOManager } from './io-manager.js';
import { 
  initStore, isUIPaused, viewingServer, currentPage, pageSize, totalPages, viewMode, 
  isLockedToBottom, selectedChannel, setRecordingStatus, loadingMessage, initDebounceMs
} from './store/uiStore.js';
import { serverList as serverListSig, channelList as channelListSig, channelCounts as channelCountsSig, currentMessages, totalCount as totalCountSig } from './store/dataStore.js';
import { ViewCache } from './view-cache.js';
import { storageManager } from '../storage/index.js';
import { MigrationManager } from '../migrations.js';
import { UI_MESSAGES, TOGGLE_BUTTON_ICON } from '../constants.js';

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
  toggleButton.textContent = TOGGLE_BUTTON_ICON;
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
      })
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
    let totalCount = finalSelectedChannel ? (channelCounts[finalSelectedChannel] || 0) : 0;

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
          currentServer, finalSelectedChannel, fetchPage, fetchSize,
          (current, total) => {
            if (renderId !== currentRenderId) return;
            const percentage = current / total;
            loadingMessage.value = `${UI_MESSAGES.LOADING_STATS}\n    已读取: ${current} / ${total} 条 (${Math.round(percentage * 100)}%)`;
          },
          offset
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
            currentServer, finalSelectedChannel, fetchPage, fetchSize,
            (current, total) => {
              if (renderId !== currentRenderId) return;
              const percentage = current / total;
              loadingMessage.value = `${UI_MESSAGES.LOADING_HISTORY}\n    已读取: ${current} / ${total} 条 (${Math.round(percentage * 100)}%)`;
            }
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
        const followResult = await dataAdapter.getMessages(currentServer, finalSelectedChannel, newTotalPages, statePageSize);
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
      preloadAdjacentPages(stateCurrentPage, newTotalPages, currentServer, finalSelectedChannel, statePageSize);
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
~~~~~

#### Acts 6: 大扫除！删除废弃的底层旧文件

~~~~~act
delete_file
src/ui/dom.js
~~~~~
~~~~~act
delete_file
src/ui/events.js
~~~~~
~~~~~act
delete_file
src/ui/renderer.js
~~~~~
~~~~~act
delete_file
src/ui/state.js
~~~~~
~~~~~act
delete_file
src/ui/templates.js
~~~~~

### 下一步建议

干得漂亮！我们已经成功将一个充满了 Vanilla JS 面条代码的 UI 库迁移到了现代化、轻量级、完全响应式的 Preact 架构下。更令人振奋的是，随着 `index.jsx` 的大幅度精简，未来你可以极易扩展出 “统计图表”、“复杂的查询过滤器” 等高级功能，因为这些都只需要单纯的补充 React 组件，无需再关注繁琐的 DOM 锁和渲染冲突。
