## [WIP] feat: 实施数据结构 V6 升级与迁移

### 用户需求
1.  将存储结构升级为支持多服务器隔离的 V6 格式。
2.  提供交互式的数据迁移功能：当检测到旧版本数据时，询问用户是否将其归并到当前所在的服务器。
3.  在设置页面增加“服务器选择器”，允许用户查看不同服务器的历史存档（只读模式），同时后台继续记录当前服务器的数据。

### 评论
这是一个涉及数据底层和 UI 交互的重大重构。我们将把扁平的 `Channel -> Messages` 结构升级为 `Server -> Channel -> Messages` 的三层结构。为了保证平滑过渡，迁移逻辑必须健壮且用户友好。

### 目标
1.  修改 `constants.js` 定义 V6 键。
2.  修改 `state.js` 以支持 V6 结构的读写，并添加 `migrateDataV5toV6` 函数。
3.  修改 `templates.js` 在设置页添加服务器选择器。
4.  修改 `ui.js` 以支持服务器切换、只读状态显示和新的数据层级渲染。
5.  修改 `main.js` 以适配新结构，确保录制逻辑指向 `activeServer`，并触发迁移流程。

### 基本原理
通过引入 `activeServer`（物理所在）和 `viewingServer`（UI 查看）两个概念，解耦录制与查看。`inMemoryChatState` 升级为根对象，包含所有服务器数据。

### 标签
#intent/build #flow/ready #priority/critical
#comp/engine #comp/ui #comp/state
#concept/state #concept/ui
#task/domain/core
#task/object/storage-v6
#task/action/migration
#task/state/continue

---

### Script

#### Acts 1: 定义 V6 存储键

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
// 全局配置与状态
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
~~~~~
~~~~~javascript.new
// 全局配置与状态
export const STORAGE_KEY_V6 = 'chatLogArchive_v6';
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
~~~~~

#### Acts 2: 更新状态管理与迁移逻辑

我们需要重写 `load` 和 `save` 以适配 V6，并添加迁移函数。同时调整合成频道的逻辑，因为它现在接收的是特定服务器的数据对象。

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
import { OLD_STORAGE_KEY_V4, STORAGE_KEY_V5 } from './constants.js';
import { getISOTimestamp } from './utils.js';

/**
 * 检查并执行一次性的数据迁移，将 v4 版本的数据转换为 v5 格式。
 */
export function migrateDataV4toV5() {
  const oldDataRaw = localStorage.getItem(OLD_STORAGE_KEY_V4);
  if (!oldDataRaw) return;

  console.log('检测到旧版本(v4)数据，正在执行一次性迁移...');
  try {
    const oldData = JSON.parse(oldDataRaw);
    const newData = {};

    for (const channel in oldData) {
      newData[channel] = oldData[channel].map((msg) => {
        const newMsg = { ...msg };
        try {
          const localDate = new Date(msg.time.replace(/-/g, '/'));
          newMsg.time = localDate.toISOString();
        } catch (e) {
          newMsg.time = new Date().toISOString();
        }
        newMsg.is_historical = true;
        return newMsg;
      });
    }

    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(newData));
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
    console.log('数据迁移成功！');
  } catch (error) {
    console.error('数据迁移失败，旧数据可能已损坏，将予以保留。', error);
  }
}
~~~~~
~~~~~javascript.new
import { OLD_STORAGE_KEY_V4, STORAGE_KEY_V5, STORAGE_KEY_V6 } from './constants.js';
import { getISOTimestamp } from './utils.js';

/**
 * 检查并执行 v5 到 v6 的数据迁移。
 * @param {string} targetServerName - 用户选择归并的服务器名称。
 * @returns {object|null} - 返回迁移后的新数据对象，如果未执行迁移则返回 null。
 */
export function migrateDataV5toV6(targetServerName) {
  const oldDataRaw = localStorage.getItem(STORAGE_KEY_V5);
  if (!oldDataRaw) return null;

  console.log(`正在将 v5 数据迁移至服务器: ${targetServerName}...`);
  try {
    const oldData = JSON.parse(oldDataRaw);
    // 加载现有的 v6 数据（如果有）
    const currentV6Raw = localStorage.getItem(STORAGE_KEY_V6);
    const v6Data = currentV6Raw ? JSON.parse(currentV6Raw) : {};

    // 归并数据
    if (!v6Data[targetServerName]) {
      v6Data[targetServerName] = oldData;
    } else {
      // 简单的覆盖/合并策略：如果目标服务器已有数据，这里暂不处理复杂的深度合并，
      // 而是假设这是首次迁移。但在实际场景中，可能会覆盖。
      // 为了安全，如果目标存在，我们打印警告，但依然执行（用户确认了）。
      // 更好的方式是把 oldData 的频道合并进去。
      console.warn('目标服务器已有数据，正在合并...');
      for (const channel in oldData) {
        if (!v6Data[targetServerName][channel]) {
          v6Data[targetServerName][channel] = oldData[channel];
        } else {
          // 简单的数组连接，后续依赖去重逻辑处理
          v6Data[targetServerName][channel] = [
            ...v6Data[targetServerName][channel],
            ...oldData[channel],
          ];
        }
      }
    }

    localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(v6Data));
    localStorage.removeItem(STORAGE_KEY_V5);
    console.log('v5 -> v6 数据迁移成功！');
    return v6Data;
  } catch (error) {
    console.error('迁移失败', error);
    return null;
  }
}

/**
 * 检查并执行一次性的数据迁移，将 v4 版本的数据转换为 v5 格式。
 */
export function migrateDataV4toV5() {
  const oldDataRaw = localStorage.getItem(OLD_STORAGE_KEY_V4);
  if (!oldDataRaw) return;

  console.log('检测到旧版本(v4)数据，正在执行一次性迁移...');
  try {
    const oldData = JSON.parse(oldDataRaw);
    const newData = {};

    for (const channel in oldData) {
      newData[channel] = oldData[channel].map((msg) => {
        const newMsg = { ...msg };
        try {
          const localDate = new Date(msg.time.replace(/-/g, '/'));
          newMsg.time = localDate.toISOString();
        } catch (e) {
          newMsg.time = new Date().toISOString();
        }
        newMsg.is_historical = true;
        return newMsg;
      });
    }

    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(newData));
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
    console.log('数据迁移成功！');
  } catch (error) {
    console.error('数据迁移失败，旧数据可能已损坏，将予以保留。', error);
  }
}
~~~~~

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
/** 从 localStorage 加载存档。*/
export function loadMessagesFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_V5)) || {};
  } catch (e) {
    console.error('读取存档失败，数据已损坏。', e);
    return {};
  }
}

/** 将内存中的存档保存到 localStorage。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到 localStorage');
  localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(messagesObject));
}

/**
 * 根据条件将消息添加到合成频道。
 * @param {object} state - 脚本的内存状态对象 (inMemoryChatState)。
 * @param {object} message - 消息数据对象。
 * @param {string} activeChannel - 消息产生时所在的活跃频道。
 */
export function addMessageToSyntheticChannelIfNeeded(state, message, activeChannel) {
  if (activeChannel !== 'Local') {
    return;
  }
~~~~~
~~~~~javascript.new
/** 从 localStorage 加载存档 (V6)。*/
export function loadMessagesFromStorage() {
  try {
    // 优先加载 V6，如果没有 V6 但有 V5，暂时返回空对象，等待迁移逻辑处理
    return JSON.parse(localStorage.getItem(STORAGE_KEY_V6)) || {};
  } catch (e) {
    console.error('读取存档失败，数据已损坏。', e);
    return {};
  }
}

/** 将内存中的存档保存到 localStorage (V6)。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到 localStorage');
  localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(messagesObject));
}

/**
 * 根据条件将消息添加到合成频道。
 * @param {object} channelMap - 特定服务器的频道映射对象 (inMemoryChatState[serverName])。
 * @param {object} message - 消息数据对象。
 * @param {string} activeChannel - 消息产生时所在的活跃频道。
 */
export function addMessageToSyntheticChannelIfNeeded(channelMap, message, activeChannel) {
  if (!channelMap || activeChannel !== 'Local') {
    return;
  }
~~~~~

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
  if (syntheticChannelName) {
    if (!state[syntheticChannelName]) {
      state[syntheticChannelName] = [];
    }
    state[syntheticChannelName].push({ ...message });
    console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
  }
}
~~~~~
~~~~~javascript.new
  if (syntheticChannelName) {
    if (!channelMap[syntheticChannelName]) {
      channelMap[syntheticChannelName] = [];
    }
    channelMap[syntheticChannelName].push({ ...message });
    console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
  }
}
~~~~~

#### Acts 3: 在设置面板添加服务器选择器

~~~~~act
patch_file
src/templates.js
~~~~~
~~~~~javascript.old
        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
~~~~~
~~~~~javascript.new
        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <div class="config-group">
                <label>查看存档服务器</label>
                <select id="log-archive-server-view-selector" class="log-archive-ui-button"></select>
                <div class="info-text-dim" style="margin-top: 5px; font-size: 0.8em;">注：此处仅切换查看内容。新消息始终会记录到你当前实际所在的服务器。</div>
            </div>
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
~~~~~

#### Acts 4: 更新 UI 逻辑以支持多服务器

UI 现在需要知道 `activeServer` (用于显示记录状态) 和 `viewingServer` (用于决定渲染什么)。

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  const uiState = {
    currentPage: 1,
    pageSize: config.pageSize,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
  };
  let isUIPaused = false;

  // --- 初始化 DOM ---
~~~~~
~~~~~javascript.new
  const uiState = {
    currentPage: 1,
    pageSize: config.pageSize,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    viewingServer: null, // 当前 UI 查看的服务器
    activeServer: null,  // 当前物理检测到的服务器
  };
  let isUIPaused = false;

  // --- 初始化 DOM ---
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  const channelSelector = document.getElementById('log-archive-channel-selector');
  const logDisplay = document.getElementById('log-archive-ui-log-display');
  const copyButton = document.getElementById('log-archive-copy-button');
  const closeButton = document.getElementById('log-archive-close-button');
~~~~~
~~~~~javascript.new
  const channelSelector = document.getElementById('log-archive-channel-selector');
  const serverViewSelector = document.getElementById('log-archive-server-view-selector');
  const logDisplay = document.getElementById('log-archive-ui-log-display');
  const copyButton = document.getElementById('log-archive-copy-button');
  const closeButton = document.getElementById('log-archive-close-button');
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  // --- 渲染核心 ---
  function renderCurrentView() {
    const selectedChannel = channelSelector.value;
    const messages = inMemoryChatState[selectedChannel] || [];

    // 视图可见性切换
    logView.style.display = uiState.viewMode === 'config' ? 'none' : 'flex';
~~~~~
~~~~~javascript.new
  // --- 渲染核心 ---
  function renderCurrentView() {
    // 确保 viewingServer 有值，默认为 activeServer，再没有就取第一个
    if (!uiState.viewingServer) {
        uiState.viewingServer = uiState.activeServer || Object.keys(inMemoryChatState)[0];
    }
    
    const viewingData = inMemoryChatState[uiState.viewingServer] || {};
    const selectedChannel = channelSelector.value;
    const messages = viewingData[selectedChannel] || [];

    // 更新只读状态提示
    const statusElement = document.getElementById('log-archive-server-status');
    if (statusElement) {
        if (uiState.activeServer && uiState.viewingServer !== uiState.activeServer) {
            statusElement.textContent = `⚠️ 正在查看 [${uiState.viewingServer}] (只读)`;
            statusElement.style.color = 'var(--color-warning)';
        } else if (uiState.activeServer) {
            statusElement.textContent = `✅ 正在记录 [${uiState.activeServer}]`;
            statusElement.style.color = 'var(--color-primary-hover)';
        } else {
             statusElement.textContent = '等待进入游戏...';
             statusElement.style.color = 'var(--color-text-dim)';
        }
    }

    // 视图可见性切换
    logView.style.display = uiState.viewMode === 'config' ? 'none' : 'flex';
~~~~~
~~~~~javascript.old
      configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;
      updateCleanButtonState(detectTotalDuplicates(inMemoryChatState));
      return;
    }

    if (isStatsMode) {
      paginationControls.style.display = 'none';
      updateTextareaAndPreserveSelection(() => {
        logDisplay.value = generateStatisticsText(messages, selectedChannel);
      });
    } else {
~~~~~
~~~~~javascript.new
      configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;
      // 清理只针对当前查看的服务器数据
      updateCleanButtonState(detectTotalDuplicates(viewingData));
      return;
    }

    if (isStatsMode) {
      paginationControls.style.display = 'none';
      updateTextareaAndPreserveSelection(() => {
        logDisplay.value = generateStatisticsText(messages, selectedChannel);
      });
    } else {
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  function updateUI() {
    const prev = channelSelector.value;
    const channels = Object.keys(inMemoryChatState);
    channelSelector.innerHTML = '';

    if (channels.length === 0) {
      channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${inMemoryChatState[ch].length})`;
        channelSelector.appendChild(opt);
      }
      if (prev && channels.includes(prev)) {
        channelSelector.value = prev;
      }
    }
    renderCurrentView();
  }
~~~~~
~~~~~javascript.new
  function updateUI() {
    // 1. 更新服务器选择器 (Settings)
    const allServers = Object.keys(inMemoryChatState);
    if (uiState.activeServer && !allServers.includes(uiState.activeServer)) {
        allServers.push(uiState.activeServer);
    }
    // 简单的去重
    const uniqueServers = [...new Set(allServers)].sort();
    
    const prevServer = serverViewSelector.value;
    serverViewSelector.innerHTML = '';
    for (const srv of uniqueServers) {
        const opt = document.createElement('option');
        opt.value = srv;
        opt.textContent = srv + (srv === uiState.activeServer ? ' (当前)' : '');
        serverViewSelector.appendChild(opt);
    }
    if (prevServer && uniqueServers.includes(prevServer)) {
        serverViewSelector.value = prevServer;
    } else if (uiState.viewingServer) {
        serverViewSelector.value = uiState.viewingServer;
    }

    // 2. 更新频道选择器 (Main) - 基于 viewingServer
    const viewingData = inMemoryChatState[uiState.viewingServer] || {};
    const channels = Object.keys(viewingData);
    const prevChannel = channelSelector.value;
    channelSelector.innerHTML = '';

    if (channels.length === 0) {
      channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${viewingData[ch].length})`;
        channelSelector.appendChild(opt);
      }
      if (prevChannel && channels.includes(prevChannel)) {
        channelSelector.value = prevChannel;
      }
    }
    renderCurrentView();
  }
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  // 顶栏通用操作
  pauseButton.addEventListener('click', () => {
    isUIPaused = !isUIPaused;
    pauseButton.classList.toggle('paused', isUIPaused);
    pauseButton.textContent = isUIPaused ? '▶️ ' : '⏸️ ';
    if (!isUIPaused) updateUI();
  });

  channelSelector.addEventListener('change', () => {
    uiState.currentPage = 1;
    renderCurrentView();
  });
~~~~~
~~~~~javascript.new
  // 顶栏通用操作
  pauseButton.addEventListener('click', () => {
    isUIPaused = !isUIPaused;
    pauseButton.classList.toggle('paused', isUIPaused);
    pauseButton.textContent = isUIPaused ? '▶️ ' : '⏸️ ';
    if (!isUIPaused) updateUI();
  });
  
  // 服务器切换
  serverViewSelector.addEventListener('change', () => {
      uiState.viewingServer = serverViewSelector.value;
      uiState.currentPage = 1;
      updateUI();
  });

  channelSelector.addEventListener('change', () => {
    uiState.currentPage = 1;
    renderCurrentView();
  });
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  cleanButton.addEventListener('click', () => {
    const duplicateCount = detectTotalDuplicates(inMemoryChatState);
    if (duplicateCount === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${duplicateCount} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const channel in inMemoryChatState) {
        const { cleanedRecords } = cleanChannelRecords(inMemoryChatState[channel]);
        inMemoryChatState[channel] = cleanedRecords;
      }
      saveMessagesToStorage(inMemoryChatState);
      updateUI();
      cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        updateCleanButtonState(0);
      }, 2000);
    }
  });

  clearButton.addEventListener('click', () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      deactivateLogger();
      localStorage.removeItem(STORAGE_KEY_V5);
      for (const key of Object.keys(inMemoryChatState)) {
        delete inMemoryChatState[key];
      }
      scanAndMergeHistory();
      saveMessagesToStorage(inMemoryChatState);
      uiState.viewMode = 'log';
      updateUI();
    }
  });
~~~~~
~~~~~javascript.new
  cleanButton.addEventListener('click', () => {
    const viewingData = inMemoryChatState[uiState.viewingServer];
    if (!viewingData) return;
    
    const duplicateCount = detectTotalDuplicates(viewingData);
    if (duplicateCount === 0) return alert('在当前查看的服务器中未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将清理 [${uiState.viewingServer}] 中的 ${duplicateCount} 条重复记录。确定要继续吗？`,
      )
    ) {
      for (const channel in viewingData) {
        const { cleanedRecords } = cleanChannelRecords(viewingData[channel]);
        viewingData[channel] = cleanedRecords;
      }
      saveMessagesToStorage(inMemoryChatState);
      updateUI();
      cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        updateCleanButtonState(0);
      }, 2000);
    }
  });

  clearButton.addEventListener('click', () => {
    if (
      confirm(
        '【严重警告】此操作将清空【所有服务器】的本地存档！确定要执行吗？',
      )
    ) {
      deactivateLogger();
      localStorage.removeItem(STORAGE_KEY_V5); // Clean legacy just in case
      // Reset everything
      for (const key of Object.keys(inMemoryChatState)) {
        delete inMemoryChatState[key];
      }
      scanAndMergeHistory(); // This will re-populate current server from DOM
      saveMessagesToStorage(inMemoryChatState);
      uiState.viewMode = 'log';
      updateUI();
    }
  });
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
    isUIPaused: () => isUIPaused,
    updateServerDisplay: (serverName) => {
      const statusElement = document.getElementById('log-archive-server-status');
      if (statusElement) {
        statusElement.textContent = serverName ? `服务器: ${serverName}` : '等待进入游戏...';
      }
    },
  };
}
~~~~~
~~~~~javascript.new
    isUIPaused: () => isUIPaused,
    updateServerDisplay: (serverName) => {
      uiState.activeServer = serverName;
      // 首次检测到服务器时，如果用户没手动选过，自动切过去
      if (!uiState.viewingServer) {
        uiState.viewingServer = serverName;
      }
      updateUI(); // 重新渲染状态栏和可能的选择器更新
    },
  };
}
~~~~~

#### Acts 5: 更新主流程 (Main)

将所有片段拼合：迁移检测、数据录入重定向。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import {
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_WARNING_THRESHOLD_MB,
} from './constants.js';
import {
~~~~~
~~~~~javascript.new
import {
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_KEY_V6,
  STORAGE_WARNING_THRESHOLD_MB,
} from './constants.js';
import {
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import {
  addMessageToSyntheticChannelIfNeeded,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  saveMessagesToStorage,
} from './state.js';
import { createUI } from './ui.js';
~~~~~
~~~~~javascript.new
import {
  addMessageToSyntheticChannelIfNeeded,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  migrateDataV5toV6,
  saveMessagesToStorage,
} from './state.js';
import { createUI } from './ui.js';
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  function scanAndMergeHistory() {
    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      const oldMessages = inMemoryChatState[channelName] || [];
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      if (newMergedMessages.length > oldMessages.length) {
        inMemoryChatState[channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(oldMessages.length);
        for (const msg of newlyAddedHistoricalMessages) {
          addMessageToSyntheticChannelIfNeeded(inMemoryChatState, msg, channelName);
        }
      }
    }
    if (dataChanged && uiControls && !uiControls.isUIPaused()) {
      uiControls.updateUI();
    }
  }
~~~~~
~~~~~javascript.new
  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  function scanAndMergeHistory() {
    if (!detectedServerName) return; // 未知服务器不录制

    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    // 确保当前服务器在内存中有对象
    if (!inMemoryChatState[detectedServerName]) {
        inMemoryChatState[detectedServerName] = {};
    }
    const serverData = inMemoryChatState[detectedServerName];

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      const oldMessages = serverData[channelName] || [];
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      if (newMergedMessages.length > oldMessages.length) {
        serverData[channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(oldMessages.length);
        for (const msg of newlyAddedHistoricalMessages) {
          addMessageToSyntheticChannelIfNeeded(serverData, msg, channelName);
        }
      }
    }
    if (dataChanged && uiControls && !uiControls.isUIPaused()) {
      uiControls.updateUI();
    }
  }
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /** 处理 MutationObserver 捕获到的新消息节点。*/
  function handleNewChatMessage(node) {
    if (isInitializingChat || isSwitchingTabs) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!currentActiveChannel) return;

    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      if (!inMemoryChatState[currentActiveChannel]) {
        inMemoryChatState[currentActiveChannel] = [];
      }
      inMemoryChatState[currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(inMemoryChatState, messageData, currentActiveChannel);

      if (uiControls && !uiControls.isUIPaused()) {
        uiControls.updateUI();
      }
    }
  }
~~~~~
~~~~~javascript.new
  /** 处理 MutationObserver 捕获到的新消息节点。*/
  function handleNewChatMessage(node) {
    if (isInitializingChat || isSwitchingTabs) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!currentActiveChannel || !detectedServerName) return;

    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      if (!inMemoryChatState[detectedServerName]) {
          inMemoryChatState[detectedServerName] = {};
      }
      const serverData = inMemoryChatState[detectedServerName];

      if (!serverData[currentActiveChannel]) {
        serverData[currentActiveChannel] = [];
      }
      serverData[currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(serverData, messageData, currentActiveChannel);

      if (uiControls && !uiControls.isUIPaused()) {
        uiControls.updateUI();
      }
    }
  }
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    // --- 启动服务器检测观察者 ---
    const updateServer = () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] 检测到服务器切换: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }
      }
    };
~~~~~
~~~~~javascript.new
    // --- 启动服务器检测观察者 ---
    const updateServer = () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] 检测到服务器切换: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }
        
        // 尝试迁移 V5 数据 (如果存在)
        const oldData = localStorage.getItem(STORAGE_KEY_V5);
        if (oldData) {
            const shouldMigrate = confirm(
                `[聊天存档 V6 升级]\n\n检测到旧版本存档！\n\n是否将旧数据归并到当前检测到的服务器：\n>> ${server} <<\n\n[确定]: 是的，这是我之前玩的服务器。\n[取消]: 不，我要换个服务器再合并。`
            );
            if (shouldMigrate) {
                const newData = migrateDataV5toV6(server);
                if (newData) {
                    inMemoryChatState = newData;
                    // Force UI Refresh
                    uiControls.updateUI(); 
                }
            }
        }
      }
    };
~~~~~

### 下一步建议

现在系统已经完全支持多服务器架构，并且具备了从旧版本平滑迁移的能力。

接下来的建议：
1.  **测试验证**: 你需要手动验证迁移流程是否顺畅，以及切换不同服务器时数据是否正确隔离。
2.  **清理代码**: `migrateDataV4toV5` 等旧代码在确认稳定后可以移除。
3.  **IndexedDB**: 一旦 V6 结构稳定，我们就可以着手实现 IndexedDB 后端，解决 5MB 限制问题。
