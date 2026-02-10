好的，我们现在进入核心的数据架构升级阶段（v6）。

这一步我们将引入 **“服务器级数据隔离”** 架构。正如我们讨论的，`inMemoryChatState` 将升级为双层映射结构：`服务器名 -> 频道名 -> 消息数组`。

### [WIP] feat: 实施 v6 数据架构与交互式迁移引导

#### 错误分析
当前（v5）架构不支持多服务器。如果用户在不同服务器间切换，聊天记录会混在一起，导致 `mergeAndDeduplicateMessages` 算法因上下文不匹配而产生大量错误合并或“空洞”警告。

#### 用户需求
1.  **数据隔离**：不同服务器的记录必须物理分离。
2.  **交互式迁移**：将旧的 v5 数据归并到用户指定的服务器。
3.  **只读查看**：允许在 A 服务器玩时查看 B 服务器的记录。

#### 评论
这是脚本架构的一次重大飞跃。通过将数据权交给用户，我们避免了自动猜测服务器可能带来的错误。同时，只读查看功能极大提升了实用性。

#### 目标
1.  定义 `STORAGE_KEY_V6`。
2.  重写 `state.js` 的存储与加载逻辑以适配双层结构。
3.  在 `main.js` 中实现基于 `confirm` 的迁移弹窗。
4.  在 `ui.js` 的设置页面中添加“服务器切换器”，并实现只读 UI 提示。

#### 标签
#intent/architect #flow/ready #priority/high 
#comp/engine #comp/ui #concept/state #scope/api #scope/ux 
#ai/brainstorm
#task/domain/storage
#task/object/v6-data-isolation
#task/action/migration
#task/state/continue

---

### Script

#### Acts 1: 更新常量与存储逻辑 (state.js)

我们将引入 `STORAGE_KEY_V6` 并重构加载/保存逻辑。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
// 全局配置与状态
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
~~~~~
~~~~~javascript.new
// 全局配置与状态
export const STORAGE_KEY_V6 = 'chatLogArchive_v6';
export const OLD_STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
~~~~~

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

/**
 * 智能合并消息数组，用于处理聊天记录不连续的情况。
 */
~~~~~
~~~~~javascript.new
import { OLD_STORAGE_KEY_V4, OLD_STORAGE_KEY_V5, STORAGE_KEY_V6 } from './constants.js';
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

    localStorage.setItem(OLD_STORAGE_KEY_V5, JSON.stringify(newData));
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
    console.log('数据迁移成功！');
  } catch (error) {
    console.error('数据迁移失败，旧数据可能已损坏，将予以保留。', error);
  }
}

/** 执行 V5 到 V6 的迁移逻辑。*/
export function performMigrationV5ToV6(activeServer, oldDataV5) {
  try {
    const v6Data = { [activeServer]: oldDataV5 };
    localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(v6Data));
    localStorage.removeItem(OLD_STORAGE_KEY_V5);
    return v6Data;
  } catch (e) {
    console.error('迁移到 V6 失败:', e);
    return null;
  }
}

/**
 * 智能合并消息数组，用于处理聊天记录不连续的情况。
 */
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
~~~~~
~~~~~javascript.new
/** 从 localStorage 加载存档。*/
export function loadMessagesFromStorage() {
  try {
    // 优先加载 v6，如果没有则返回空对象（等待迁移）
    return JSON.parse(localStorage.getItem(STORAGE_KEY_V6)) || {};
  } catch (e) {
    console.error('读取存档失败，数据已损坏。', e);
    return {};
  }
}

/** 将内存中的存档保存到 localStorage。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到 localStorage');
  localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(messagesObject));
}
~~~~~

#### Acts 2: 更新 UI 模板与渲染逻辑 (templates.js, ui.js)

在设置页增加服务器切换，并在主页增加只读状态显示。

~~~~~act
patch_file
src/templates.js
~~~~~
~~~~~javascript.old
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
~~~~~
~~~~~javascript.new
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>查看存档服务器</label>
                <select id="log-archive-server-view-selector" class="log-archive-ui-button"></select>
                <p class="info-text-dim">注：无论查看哪个服务器，新消息只会记录到当前所在的服务器中。</p>
            </div>
            <div class="config-group">
~~~~~

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
~~~~~
~~~~~javascript.new
  const uiState = {
    currentPage: 1,
    pageSize: config.pageSize,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    viewingServer: null, // 当前正在查看的服务器名
  };
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  const pageSizeInput = document.getElementById('log-archive-page-size-input');
  const configStorageInfo = document.getElementById('log-archive-config-storage-info');
~~~~~
~~~~~javascript.new
  const pageSizeInput = document.getElementById('log-archive-page-size-input');
  const serverViewSelector = document.getElementById('log-archive-server-view-selector');
  const configStorageInfo = document.getElementById('log-archive-config-storage-info');
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
~~~~~
~~~~~javascript.new
  // --- 渲染核心 ---
  function renderCurrentView() {
    const selectedChannel = channelSelector.value;
    const viewingServer = uiState.viewingServer;
    
    // 如果没有选择服务器，显示提示
    if (!viewingServer) {
        logDisplay.value = '--- 请在设置中选择要查看的服务器 ---';
        return;
    }

    const messages = inMemoryChatState[viewingServer]?.[selectedChannel] || [];

    // 视图可见性切换
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
    // 更新服务器选择器 (设置页)
    const servers = Object.keys(inMemoryChatState);
    const prevServer = serverViewSelector.value;
    serverViewSelector.innerHTML = '';
    for (const s of servers) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      serverViewSelector.appendChild(opt);
    }
    if (prevServer && servers.includes(prevServer)) {
        serverViewSelector.value = prevServer;
    } else if (servers.length > 0 && !uiState.viewingServer) {
        uiState.viewingServer = servers[0];
        serverViewSelector.value = servers[0];
    }

    // 更新频道选择器
    const prevChannel = channelSelector.value;
    const currentServerData = inMemoryChatState[uiState.viewingServer] || {};
    const channels = Object.keys(currentServerData);
    channelSelector.innerHTML = '';

    if (channels.length === 0) {
      channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${currentServerData[ch].length})`;
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
  channelSelector.addEventListener('change', () => {
    uiState.currentPage = 1;
    renderCurrentView();
  });
~~~~~
~~~~~javascript.new
  channelSelector.addEventListener('change', () => {
    uiState.currentPage = 1;
    renderCurrentView();
  });

  serverViewSelector.addEventListener('change', () => {
    uiState.viewingServer = serverViewSelector.value;
    uiState.currentPage = 1;
    updateUI();
  });
~~~~~

#### Acts 3: 在 `main.js` 中实现迁移流程与录制分流

我们将修改 `handleNewChatMessage` 以支持服务器名，并添加迁移引导逻辑。

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
~~~~~
~~~~~javascript.new
import {
  OLD_STORAGE_KEY_V4,
  OLD_STORAGE_KEY_V5,
  SELF_NAME_KEY,
  STORAGE_KEY_V6,
  STORAGE_WARNING_THRESHOLD_MB,
} from './constants.js';
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
      if (!inMemoryChatState[detectedServerName][currentActiveChannel]) {
        inMemoryChatState[detectedServerName][currentActiveChannel] = [];
      }
      
      inMemoryChatState[detectedServerName][currentActiveChannel].push(messageData);
      // 注意：合成频道函数也需要适配，这里暂时简单传该服务器的状态
      addMessageToSyntheticChannelIfNeeded(inMemoryChatState[detectedServerName], messageData, currentActiveChannel);

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
import {
  addMessageToSyntheticChannelIfNeeded,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  saveMessagesToStorage,
} from './state.js';
~~~~~
~~~~~javascript.new
import {
  addMessageToSyntheticChannelIfNeeded,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  performMigrationV5ToV6,
  saveMessagesToStorage,
} from './state.js';
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

        // 交互式迁移检查
        const oldDataV5 = localStorage.getItem(OLD_STORAGE_KEY_V5);
        if (oldDataV5 && detectedServerName) {
            const confirmMsg = `检测到旧版本存档！\n\n是否将所有旧记录合并到当前服务器：[${detectedServerName}]？\n\n如果这不是你想要的服务器，请点击“取消”，切换服务器进入后再试。`;
            if (confirm(confirmMsg)) {
                const newV6 = performMigrationV5ToV6(detectedServerName, JSON.parse(oldDataV5));
                if (newV6) {
                    inMemoryChatState = newV6;
                    uiControls.updateUI();
                    alert('数据迁移成功！');
                }
            }
        }
      }
    };
~~~~~

#### Acts 4: 修复 `scanAndMergeHistory` 等逻辑中的路径访问

由于 `inMemoryChatState` 结构变了，我们需要确保历史扫描也写入正确的服务器。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
  function scanAndMergeHistory() {
    if (!detectedServerName) return;

    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      
      if (!inMemoryChatState[detectedServerName]) {
          inMemoryChatState[detectedServerName] = {};
      }

      const oldMessages = inMemoryChatState[detectedServerName][channelName] || [];
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      if (newMergedMessages.length > oldMessages.length) {
        inMemoryChatState[detectedServerName][channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(oldMessages.length);
        for (const msg of newlyAddedHistoricalMessages) {
          addMessageToSyntheticChannelIfNeeded(inMemoryChatState[detectedServerName], msg, channelName);
        }
      }
    }
~~~~~

### 下一步建议

我们已经完成了多服务器架构的核心升级：
1.  **数据隔离**：现在所有的读写都基于 `detectedServerName`。
2.  **引导迁移**：用户进入服务器时会看到清晰的合并提示。
3.  **灵活查看**：用户可以在设置里自由切换想看哪个服务器的存档。

**接下来可能需要：**
- **清理逻辑优化**：目前的 `detectTotalDuplicates` 等统计函数还需要适配 `v6` 结构（即遍历所有服务器进行统计），否则“存储占用”和“清理重复”可能只显示当前服务器的信息。
- **存储显示优化**：在设置页面显示各服务器的占用明细。

你希望先完善统计清理功能，还是先处理一下 `analysis.js` 中的适配问题？
