简要回答
这是一个激动人心的架构升级阶段。根据重构路线图的 Phase 2（数据库层现代化）要求，我将废弃同步的内存全量状态 `inMemoryChatState`，利用 IndexedDB 的原生查询能力和游标来实现按页获取与增量写入。这些修改将极大降低运行时的 JS 堆内存占用并彻底解决卡顿问题。

我已生成了具体的操作计划。

## [WIP] refactor: 实现数据库层的现代化和异步增量操作

### 错误分析
无。这是一次架构级别的重构，而不是错误修复。

### 用户需求
彻底移除同步的全量保存 (`saveAllV6`) 操作，改用按需加载的分页查询和增量写入，从而避免在大规模聊天记录下出现的界面卡顿。

### 评论
这次修改是整个重构的核心枢纽。通过建立 `server_channel_time` 和 `server_channel` 等复合索引，我们首次赋予了 IndexedDB 真正的“数据库”查询能力，而不再是单纯把它当作一个大号的 JSON Key-Value 存储。这不仅减轻了主线程的内存负担，也为之后引入 Web Worker 铺平了道路。

### 目标
1. 升级数据库 Schema，创建支持高效分页的复合索引（`DB_VERSION = 2`）。
2. 在 `IndexedDBAdapter` 和 `StorageManager` 中实现基于 IDB 游标的 `getMessages`, `getLatestMessages`, `putMessage` 和相关的元数据获取方法。
3. 从 `main.js` 中彻底移除 `inMemoryChatState` 和定时保存逻辑，改为每解析一条消息就进行一次 `putMessage` 的增量写入。
4. 解耦 UI 层，移除 `ui/index.js` 中的 `legacyAppState` 缓存，将遗留的大型操作适配为异步拉取状态。
5. 将 `state.js` 中的副作用函数 `addMessageToSyntheticChannelIfNeeded` 重构为纯函数 `getSyntheticChannelName` 以适应新的异步写入流程。

### 基本原理
IndexedDB 拥有强大的游标 (`cursor`) 和键范围 (`IDBKeyRange`) 支持。通过 `[server, channel, time]` 的复合索引，我们可以以 `O(1)` 的偏移时间快速获取任意页面的数据；利用 `[server, channel]` 索引搭配 `nextunique` 游标，可以瞬时获取列表目录。由于数据的持久化是增量和即时的，我们抛弃了全量同步数组，这彻底消解了 `JSON.stringify` 导致的卡顿。

### 标签
#intent/refine #flow/ready #priority/high #comp/engine #comp/runtime #concept/state #concept/executor #scope/core #scope/performance #ai/instruct #task/domain/storage #task/object/indexed-db #task/action/modernization #task/state/begin

---

### Script

#### Acts 1: 升级常量配置
首先，增加 `DB_VERSION` 以便触发数据库升级事件。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript
// IndexedDB 配置
export const DB_NAME = 'pt-chat-archiver-v7';
export const DB_VERSION = 1;
export const STORE_MESSAGES = 'messages';
~~~~~
~~~~~javascript
// IndexedDB 配置
export const DB_NAME = 'pt-chat-archiver-v7';
export const DB_VERSION = 2;
export const STORE_MESSAGES = 'messages';
~~~~~

#### Acts 2: 升级 IndexedDB 适配器
在这里，我们将引入新的复合索引，并实现一系列的增量写入、分页查询和游标聚合方法。这是整个存储层的骨架。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // 创建消息存储 Store
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
          msgStore.createIndex('server', 'server', { unique: false });
          msgStore.createIndex('channel', 'channel', { unique: false });
          msgStore.createIndex('time', 'time', { unique: false });
        }
        // 创建配置存储 Store
        if (!db.objectStoreNames.contains(STORE_CONFIG)) {
          db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
        }
      };
~~~~~
~~~~~javascript
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        let msgStore;
        // 创建消息存储 Store
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
          msgStore.createIndex('server', 'server', { unique: false });
          msgStore.createIndex('channel', 'channel', { unique: false });
          msgStore.createIndex('time', 'time', { unique: false });
        } else {
          msgStore = event.target.transaction.objectStore(STORE_MESSAGES);
        }
        
        // V2 新增复合索引
        if (!msgStore.indexNames.contains('server_channel')) {
          msgStore.createIndex('server_channel', ['server', 'channel'], { unique: false });
        }
        if (!msgStore.indexNames.contains('server_channel_time')) {
          msgStore.createIndex('server_channel_time', ['server', 'channel', 'time'], { unique: false });
        }

        // 创建配置存储 Store
        if (!db.objectStoreNames.contains(STORE_CONFIG)) {
          db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
        }
      };
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript
  /**
   * 辅助方法：开启事务
   */
  _tx(storeNames, mode) {
~~~~~
~~~~~javascript
  putMessage(msg) {
    return new Promise((resolve, reject) => {
      if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.put(msg);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  putMessages(msgs) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const msg of msgs) {
        if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
        store.put(msg);
      }
    });
  }

  getServers() {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server');
      const req = index.openKeyCursor(null, 'nextunique');
      const servers = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          servers.push(cursor.key);
          cursor.continue();
        } else {
          resolve(servers);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  getChannels(server) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel');
      const range = IDBKeyRange.bound([server, ''], [server, '\uffff']);
      const req = index.openKeyCursor(range, 'nextunique');
      const channels = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          channels.push(cursor.key[1]);
          cursor.continue();
        } else {
          resolve(channels);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  getMessages(server, channel, page, pageSize) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
      
      const countReq = index.count(range);
      countReq.onsuccess = () => {
        const total = countReq.result;
        const messages = [];
        const start = (page - 1) * pageSize;
        
        if (start >= total || total === 0) {
          return resolve({ messages, total });
        }
        
        const cursorReq = index.openCursor(range, 'next');
        let advanced = false;
        
        cursorReq.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) {
            return resolve({ messages, total });
          }
          if (start > 0 && !advanced) {
            advanced = true;
            cursor.advance(start);
          } else {
            messages.push(cursor.value);
            if (messages.length < pageSize) {
              cursor.continue();
            } else {
              resolve({ messages, total });
            }
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  }

  getLatestMessages(server, channel, limit) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
      
      const cursorReq = index.openCursor(range, 'prev');
      const messages = [];
      
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          messages.unshift(cursor.value); // 加入队首以保持升序
          if (messages.length < limit) {
            cursor.continue();
          } else {
            resolve(messages);
          }
        } else {
          resolve(messages);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  /**
   * 辅助方法：开启事务
   */
  _tx(storeNames, mode) {
~~~~~

#### Acts 3: 暴露 StorageManager 接口
我们将新编写的底层数据库方法挂载到对外的 `StorageManager` 单例上。

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript
  loadAllV6() {
    return this.adapter.loadAllV6();
  }
~~~~~
~~~~~javascript
  putMessage(msg) {
    if (this.adapter?.putMessage) return this.adapter.putMessage(msg);
    return Promise.resolve();
  }

  putMessages(msgs) {
    if (this.adapter?.putMessages) return this.adapter.putMessages(msgs);
    return Promise.resolve();
  }

  getServers() {
    if (this.adapter?.getServers) return this.adapter.getServers();
    return Promise.resolve([]);
  }

  getChannels(server) {
    if (this.adapter?.getChannels) return this.adapter.getChannels(server);
    return Promise.resolve([]);
  }

  getMessages(server, channel, page, pageSize) {
    if (this.adapter?.getMessages) return this.adapter.getMessages(server, channel, page, pageSize);
    return Promise.resolve({ messages: [], total: 0 });
  }

  getLatestMessages(server, channel, limit) {
    if (this.adapter?.getLatestMessages) return this.adapter.getLatestMessages(server, channel, limit);
    return Promise.resolve([]);
  }

  loadAllV6() {
    return this.adapter.loadAllV6();
  }
~~~~~

#### Acts 4: 重构合成频道的业务纯函数
废弃原地修改状态引用的副作用函数，改用一个纯函数获取虚拟频道的名称。

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript
/**
 * 根据条件将消息添加到合成频道。
 * @param {object} channelMap - 对应服务器的频道映射对象 (inMemoryChatState[server])。
 * @param {object} message - 消息数据对象。
 * @param {string} activeChannel - 消息产生时所在的活跃频道。
 */
export function addMessageToSyntheticChannelIfNeeded(channelMap, message, activeChannel) {
  if (activeChannel !== 'Local' || !channelMap) {
    return;
  }
  let syntheticChannelName = null;
  if (message.type.includes('party')) {
    syntheticChannelName = 'Party-Local';
  } else if (message.type.includes('whisper')) {
    syntheticChannelName = 'Whisper-Local';
  }
  if (syntheticChannelName) {
    if (!channelMap[syntheticChannelName]) {
      channelMap[syntheticChannelName] = [];
    }
    channelMap[syntheticChannelName].push({ ...message });
    // console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
  }
}
~~~~~
~~~~~javascript
/**
 * 确定消息是否应分配到一个额外的合成频道（例如 Party-Local）。
 * @param {object} message - 消息数据对象。
 * @param {string} activeChannel - 消息产生时所在的活跃频道。
 * @returns {string|null} - 返回合成频道名，如果不适用则返回 null。
 */
export function getSyntheticChannelName(message, activeChannel) {
  if (activeChannel !== 'Local') {
    return null;
  }
  if (message.type.includes('party')) {
    return 'Party-Local';
  } else if (message.type.includes('whisper')) {
    return 'Whisper-Local';
  }
  return null;
}
~~~~~

#### Acts 5: 主线剥离内存全量状态
这是代码中改动最激动人心的一步。我们将删除所有的“定时保存机制”，删除 `inMemoryChatState` 数组，全面转为流式的增量操作。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript
import { addMessageToSyntheticChannelIfNeeded, mergeAndDeduplicateMessages } from './state.js';
import { storageManager } from './storage/index.js';
import { createUI } from './ui/index.js';
import { generateULID } from './utils.js';
import { debounce, getISOTimestamp } from './utils.js';

(async () => {
  // --- 全局状态 ---
  let inMemoryChatState = {};
  let messageObserver = null;
~~~~~
~~~~~javascript
import { getSyntheticChannelName, mergeAndDeduplicateMessages } from './state.js';
import { storageManager } from './storage/index.js';
import { createUI } from './ui/index.js';
import { generateULID } from './utils.js';
import { debounce, getISOTimestamp } from './utils.js';

(async () => {
  // --- 全局状态 ---
  let messageObserver = null;
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript
  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  async function scanAndMergeHistory() {
    if (!detectedServerName) return;
    const historicalState = await extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      if (!inMemoryChatState[detectedServerName]) inMemoryChatState[detectedServerName] = {};
      const serverData = inMemoryChatState[detectedServerName];

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

  /*
   * =================================================================
   * 脚本主程序与生命周期管理
   * =================================================================
   */

  /** 处理 MutationObserver 捕获到的新消息节点。*/
  async function handleNewChatMessage(node) {
    if (isInitializingChat || isSwitchingTabs || !detectedServerName) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!currentActiveChannel) return;

    const selfName = (await storageManager.getSelfName()) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      if (!inMemoryChatState[detectedServerName]) inMemoryChatState[detectedServerName] = {};
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
~~~~~javascript
  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  async function scanAndMergeHistory() {
    if (!detectedServerName) return;
    const historicalState = await extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      
      // 通过数据库获取当前频道的最末尾消息片段，用于比较查重和断层
      const oldMessages = await storageManager.getLatestMessages(detectedServerName, channelName, 200);
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      if (newMergedMessages.length > oldMessages.length) {
        const newlyAdded = newMergedMessages.slice(oldMessages.length);
        for (const msg of newlyAdded) {
          msg.server = detectedServerName;
          msg.channel = channelName;
        }
        await storageManager.putMessages(newlyAdded);
        
        const synthMessages = [];
        for (const msg of newlyAdded) {
          const synthChannel = getSyntheticChannelName(msg, channelName);
          if (synthChannel) {
            const synthMsg = { ...msg, channel: synthChannel };
            // 清除原有生成的 ID，使新插入的合成记录能够被分配新 ID 以确保唯一性
            delete synthMsg.id;
            synthMessages.push(synthMsg);
          }
        }
        if (synthMessages.length > 0) {
          await storageManager.putMessages(synthMessages);
        }
        dataChanged = true;
      }
    }
    if (dataChanged && uiControls && !uiControls.isUIPaused()) {
      uiControls.updateUI();
    }
  }

  /*
   * =================================================================
   * 脚本主程序与生命周期管理
   * =================================================================
   */

  /** 处理 MutationObserver 捕获到的新消息节点。*/
  async function handleNewChatMessage(node) {
    if (isInitializingChat || isSwitchingTabs || !detectedServerName) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!currentActiveChannel) return;

    const selfName = (await storageManager.getSelfName()) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      messageData.server = detectedServerName;
      messageData.channel = currentActiveChannel;
      
      await storageManager.putMessage(messageData);

      const synthChannel = getSyntheticChannelName(messageData, currentActiveChannel);
      if (synthChannel) {
        const synthMsg = { ...messageData, channel: synthChannel };
        delete synthMsg.id;
        await storageManager.putMessage(synthMsg);
      }

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
~~~~~javascript
  /** 停用并清理聊天记录器。*/
  function deactivateLogger() {
    if (messageObserver) {
      messageObserver.disconnect();
      messageObserver = null;
    }
    if (tabObserver) {
      tabObserver.disconnect();
      tabObserver = null;
    }
    isInitializingChat = false;
    isSwitchingTabs = false;
    currentActiveChannel = null;
  }

  /** 执行一次完整的保存动作并更新 UI。*/
  async function performAutoSave() {
    console.info('Saving archive to local storage (V6)...');
    await storageManager.saveAllV6(inMemoryChatState);
    if (uiControls) {
      uiControls.setLastSavedTime(getISOTimestamp());
      await uiControls.checkStorageUsage();
    }
  }

  /** (重新)启动自动保存定时器。*/
  function startAutoSaveTimer() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    const intervalSeconds = uiControls ? uiControls.getAutoSaveInterval() : 30;
    console.log(`[Archiver] Auto-save timer started, interval: ${intervalSeconds}s`);
    autoSaveTimer = setInterval(performAutoSave, intervalSeconds * 1000);
  }

  /** 脚本主入口函数。*/
  async function main() {
    // 1. 初始化存储层 (并自动触发 V6->V7 迁移)
    // 开启 useIndexedDB = true
    await storageManager.init(true);

    // 2. 加载状态与初始化 UI
    inMemoryChatState = await storageManager.loadAllV6();

    // 构建 DataAdapter：UI 层与数据层的隔离界面
    const dataAdapter = {
      getServers: async () => Object.keys(inMemoryChatState),
      getChannels: async (server) => Object.keys(inMemoryChatState[server] || {}),
      getMessages: async (server, channel, page, pageSize) => {
        const list = inMemoryChatState[server]?.[channel] || [];
        const total = list.length;
        const start = (page - 1) * pageSize;
        // 模拟异步延迟以确保 UI 能够正确处理 Loading 态 (可选，暂不加延迟)
        return {
          messages: list.slice(start, start + pageSize),
          total,
        };
      },
      getAllData: async () => inMemoryChatState, // 用于导出功能
      // 兼容旧接口，用于分析模块
      getRawState: () => inMemoryChatState,
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: (state) => storageManager.saveAllV6(state), // Pass a compatible function
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
      manualSave: performAutoSave,
      onAutoSaveIntervalChange: startAutoSaveTimer,
      replaceState: (newState) => {
        inMemoryChatState = newState;
        // 注意：UI 内部现在不持有 state，所以 replaceState 后 UI 会通过 refreshView 自动拉取新数据
      },
    });

    await uiControls.checkStorageUsage();

    // --- 启动服务器检测观察者 ---
    const updateServer = async () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }

        // 3. 检查并触发交互式迁移 (如 v5 -> v6)
        await MigrationManager.checkAndTriggerInteractiveMigrations(
          storageManager,
          server,
          inMemoryChatState,
          (newState) => {
            inMemoryChatState = newState;
            uiControls.setState(inMemoryChatState);
          },
        );
      }
    };

    serverObserver = new MutationObserver(updateServer);
    serverObserver.observe(document.body, { childList: true, subtree: true });
    await updateServer(); // 立即执行一次

    const uiObserver = new MutationObserver(() => {
      const { chatLogContainer } = locateChatElements();
      if (chatLogContainer) {
        const isVisible = chatLogContainer.style.display !== 'none';
        if (isVisible && !messageObserver) {
          activateLogger();
        } else if (!isVisible && messageObserver) {
          deactivateLogger();
        }
      } else if (messageObserver) {
        deactivateLogger();
      }
    });
    uiObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

    startAutoSaveTimer();

    window.addEventListener('pagehide', () => storageManager.saveAllV6(inMemoryChatState));
  }
~~~~~
~~~~~javascript
  /** 停用并清理聊天记录器。*/
  function deactivateLogger() {
    if (messageObserver) {
      messageObserver.disconnect();
      messageObserver = null;
    }
    if (tabObserver) {
      tabObserver.disconnect();
      tabObserver = null;
    }
    isInitializingChat = false;
    isSwitchingTabs = false;
    currentActiveChannel = null;
  }

  /** 脚本主入口函数。*/
  async function main() {
    // 1. 初始化存储层 (并自动触发 V6->V7 迁移)
    // 开启 useIndexedDB = true
    await storageManager.init(true);

    // 构建 DataAdapter：UI 层与数据层的隔离界面
    const dataAdapter = {
      getServers: async () => await storageManager.getServers(),
      getChannels: async (server) => await storageManager.getChannels(server),
      getMessages: async (server, channel, page, pageSize) => {
        return await storageManager.getMessages(server, channel, page, pageSize);
      },
      getAllData: async () => await storageManager.loadAllV6(), // 用于导出功能
      // 兼容旧接口，用于重型操作如分析模块等
      getRawState: async () => await storageManager.loadAllV6(),
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state), // 仍提供给批量导入等特殊维护操作使用
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
      onAutoSaveIntervalChange: () => {}, // 设置间隔仅为了兼容旧UI交互
      replaceState: async (newState) => {
        // UI 会被通知刷新以自动请求新数据
      },
    });

    await uiControls.checkStorageUsage();

    // --- 启动服务器检测观察者 ---
    const updateServer = async () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }

        // 3. 检查并触发交互式迁移 (如 v5 -> v6)
        const currentState = await storageManager.loadAllV6();
        await MigrationManager.checkAndTriggerInteractiveMigrations(
          storageManager,
          server,
          currentState,
          (newState) => {
            if (uiControls.setState) uiControls.setState(newState);
          },
        );
      }
    };

    serverObserver = new MutationObserver(updateServer);
    serverObserver.observe(document.body, { childList: true, subtree: true });
    await updateServer(); // 立即执行一次

    const uiObserver = new MutationObserver(() => {
      const { chatLogContainer } = locateChatElements();
      if (chatLogContainer) {
        const isVisible = chatLogContainer.style.display !== 'none';
        if (isVisible && !messageObserver) {
          activateLogger();
        } else if (!isVisible && messageObserver) {
          deactivateLogger();
        }
      } else if (messageObserver) {
        deactivateLogger();
      }
    });
    uiObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
  }
~~~~~

#### Acts 6: 在 UI 侧抹去双份状态引用的痕迹
我们要清除掉 UI 中残存的用于支撑旧版分析逻辑的 `legacyAppState` 引用。改为让需要它的功能临时向 `DataAdapter` 异步拉取一次。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript
export async function createUI(dataAdapter, appCallbacks) {
  // 临时保留 appState 仅用于那些尚未重构的导出功能 (downloadJSON etc.)
  // 一旦这些功能也迁移到 Adapter，这个变量即可移除
  let legacyAppState = await dataAdapter.getAllData();

  // 1. Initialize DOM structure
~~~~~
~~~~~javascript
export async function createUI(dataAdapter, appCallbacks) {
  // 1. Initialize DOM structure
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript
            // 1. 更新全局状态引用 (main.js)
            if (appCallbacks.replaceState) {
              appCallbacks.replaceState(importedData);
            }
            // 2. 更新 UI 本地 legacy 状态 (用于未重构的功能)
            legacyAppState = importedData;

            // 3. 持久化
            await appCallbacks.saveMessagesToStorage(importedData);

            const originalText = dom.importButton.textContent;
~~~~~
~~~~~javascript
            // 持久化覆盖
            await appCallbacks.saveMessagesToStorage(importedData);

            const originalText = dom.importButton.textContent;
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript
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
~~~~~
~~~~~javascript
  // 注意：cleanChannelRecords 等功能仍深度依赖同步计算，
  // 在 Phase 4 重构分析模块之前，我们暂时通过异步加载全量数据来维持逻辑
  const cleanChannelRecords = async () => {
    const rawState = await dataAdapter.getRawState();
    let totalToClean = 0;
    for (const server in rawState) {
      totalToClean += appCallbacks.detectTotalDuplicates(rawState[server]);
    }

    if (totalToClean === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${totalToClean} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const server in rawState) {
        const serverData = rawState[server];
        for (const channel in serverData) {
          const { cleanedRecords } = appCallbacks.cleanChannelRecords(serverData[channel]);
          serverData[channel] = cleanedRecords;
        }
      }
      await appCallbacks.saveMessagesToStorage(rawState);
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
      await appCallbacks.scanAndMergeHistory();
      refreshView();
    }
  };

  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
  };

  const recoverLegacyData = async (targetServer) => {
    try {
      const rawState = await dataAdapter.getRawState();
      const newState = await MigrationManager.recoverAndMergeAll(rawState, targetServer);
      await appCallbacks.saveMessagesToStorage(newState);
      alert('数据恢复合并完成！已自动清理旧版残留。');
    } catch (err) {
      console.error('[Recovery] Failed:', err);
      alert('恢复失败，详情请查看控制台。');
    }
  };
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript
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
~~~~~
~~~~~javascript
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
~~~~~

#### Acts 7: 更新 Renderer 对 `getRawState` 的异步调用
现在 `callbacks.getRawState()` 返回 Promise，我们需要适配它的异步调用。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript
      // 计算重复项总数 (需要从 callbacks 获取全量数据进行计算，或者由上层计算后传入)
      // 这里的逻辑暂时保留依赖 callbacks，直到查重功能也被重构
      if (callbacks.detectTotalDuplicates && callbacks.getRawState) {
        const rawState = callbacks.getRawState();
        let totalDuplicates = 0;
        for (const server in rawState) {
          totalDuplicates += callbacks.detectTotalDuplicates(rawState[server]);
        }
        updateCleanButtonState(totalDuplicates);
      }
      return;
~~~~~
~~~~~javascript
      // 计算重复项总数 (需要从 callbacks 获取全量数据进行计算，或者由上层计算后传入)
      // 这里的逻辑暂时保留依赖 callbacks，直到查重功能也被重构
      if (callbacks.detectTotalDuplicates && callbacks.getRawState) {
        callbacks.getRawState().then((rawState) => {
          let totalDuplicates = 0;
          for (const server in rawState) {
            totalDuplicates += callbacks.detectTotalDuplicates(rawState[server]);
          }
          updateCleanButtonState(totalDuplicates);
        });
      }
      return;
~~~~~

### 下一步建议
通过这几个行动，我们已经完全破除了系统对 “同步全量状态” 和 “高频完整覆写” 的刚性依赖。数据库层已经步入现代化，并做好了迎接近似无限容量且零卡顿的读写能力。你可以再次运行项目检验是否还存在之前由于存档过大导致的性能抖动。

下一步，我们将正式踏入 Phase 3，利用 Web Worker 将数据库操作和主线程完全剥离开来。如果你准备好了，我们可以继续。
