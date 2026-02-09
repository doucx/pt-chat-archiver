好的，测试通过。我们来处理下一个核心模块：状态管理。

---

## [WIP] refactor: 提取状态管理与持久化逻辑至 state.js

### 用户需求
将 `src/main.js` 中负责数据迁移、合并、加载、存储和清理的函数提取到一个新的 `src/state.js` 模块中，以实现业务逻辑和状态操作的分离。

### 评论
这是实现“关注点分离” (Separation of Concerns) 的关键步骤。通过将所有直接操作数据（无论是内存中的 `inMemoryChatState` 还是 `localStorage`）的逻辑封装到 `state.js` 中，`main.js` 就演变成了更高层次的“控制器”，只负责协调 UI、解析器和状态模块，而不关心数据具体是如何被处理的。这使得代码更容易测试和推理。

### 目标
1.  创建 `src/state.js` 文件，并将 `migrateDataV4toV5`, `mergeAndDeduplicateMessages`, `loadMessagesFromStorage`, `saveMessagesToStorage`, `addMessageToSyntheticChannelIfNeeded`, `cleanChannelRecords`, `detectTotalDuplicates` 等函数移入。
2.  对 `addMessageToSyntheticChannelIfNeeded` 进行轻微重构，使其不再依赖全局变量，而是通过参数接收 state 对象，增强其模块独立性。
3.  更新 `src/main.js`，移除这些函数的定义，并从新模块中导入它们。

### 基本原理
我们正在将应用划分为不同的逻辑层。`state.js` 将成为我们的“服务层”或“模型层”，专门负责处理数据的完整性、持久性和业务规则。主文件 `main.js` 作为“应用层”，调用服务来完成任务。

### 标签
#intent/refine #flow/ready #priority/high #comp/core #concept/state #scope/core #ai/instruct #task/domain/refactoring #task/object/modularity #task/action/extraction #task/state/continue

---

### Script

#### Acts 1: 创建状态管理模块

我们创建 `src/state.js`，并将所有与数据状态直接相关的函数移入。注意 `addMessageToSyntheticChannelIfNeeded` 的签名已被修改，以接收 `state` 对象作为第一个参数。

~~~~~act
write_file
src/state.js
~~~~~
~~~~~javascript
import { STORAGE_KEY_V5, OLD_STORAGE_KEY_V4 } from './constants.js';
import { getISOTimestamp } from './utils.js';

/**
 * 检查并执行一次性的数据迁移，将 v4 版本的数据转换为 v5 格式。
 */
export function migrateDataV4toV5() {
  const oldDataRaw = localStorage.getItem(OLD_STORAGE_KEY_V4);
  if (!oldDataRaw) return;

  console.log("检测到旧版本(v4)数据，正在执行一次性迁移...");
  try {
    const oldData = JSON.parse(oldDataRaw);
    const newData = {};

    for (const channel in oldData) {
      newData[channel] = oldData[channel].map(msg => {
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
    console.log("数据迁移成功！");
  } catch (error) {
    console.error("数据迁移失败，旧数据可能已损坏，将予以保留。", error);
  }
}

/**
 * 智能合并消息数组，用于处理聊天记录不连续的情况。
 */
export function mergeAndDeduplicateMessages(oldMessages, newMessages) {
  if (!oldMessages || oldMessages.length === 0) return newMessages;
  if (!newMessages || newMessages.length === 0) return oldMessages;
  const oldUserMessages = oldMessages.filter(msg => !msg.is_archiver);
  const newUserMessages = newMessages.filter(msg => !msg.is_archiver);
  let overlapLength = 0;
  const maxPossibleOverlap = Math.min(oldUserMessages.length, newUserMessages.length);
  for (let i = maxPossibleOverlap; i > 0; i--) {
    const suffixOfOld = oldUserMessages.slice(-i).map(msg => msg.content);
    const prefixOfNew = newUserMessages.slice(0, i).map(msg => msg.content);
    if (JSON.stringify(suffixOfOld) === JSON.stringify(prefixOfNew)) {
      overlapLength = i;
      break;
    }
  }
  let messagesToAdd;
  if (overlapLength > 0) {
    const lastOverlappingUserMessage = newUserMessages[overlapLength - 1];
    const lastOverlappingIndexInNew = newMessages.findIndex(msg => msg === lastOverlappingUserMessage);
    messagesToAdd = newMessages.slice(lastOverlappingIndexInNew + 1);
  } else {
    messagesToAdd = newMessages;
  }
  const discontinuityDetected = oldMessages.length > 0 && newMessages.length > 0 && overlapLength === 0;
  if (messagesToAdd.length === 0) return oldMessages;
  if (discontinuityDetected) {
    console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
    const discontinuityMark = {
      time: getISOTimestamp(), type: 'system', sender: 'Archiver', receiver: 'System',
      content: '[警告 - 此处可能存在记录丢失]', is_archiver: true
    };
    return oldMessages.concat([discontinuityMark], messagesToAdd);
  }
  return oldMessages.concat(messagesToAdd);
}

/** 从 localStorage 加载存档。*/
export function loadMessagesFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_V5)) || {};
  } catch (e) {
    console.error('读取存档失败，数据已损坏。', e); return {};
  }
}

/** 将内存中的存档保存到 localStorage。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到 localStorage')
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
  let syntheticChannelName = null;
  if (message.type.includes('party')) {
    syntheticChannelName = 'Party-Local';
  } else if (message.type.includes('whisper')) {
    syntheticChannelName = 'Whisper-Local';
  }
  if (syntheticChannelName) {
    if (!state[syntheticChannelName]) {
      state[syntheticChannelName] = [];
    }
    state[syntheticChannelName].push({ ...message });
    console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
  }
}

/**
 * 清理一个频道记录中的重复数据。
 * @param {Array<object>} records - 一个频道的聊天记录数组。
 * @returns {{cleanedRecords: Array<object>, removedCount: number}} - 清理后的记录和被移除的记录数。
 */
export function cleanChannelRecords(records) {
    if (!records || records.length === 0) {
        return { cleanedRecords: [], removedCount: 0 };
    }
    const BURST_COUNT_THRESHOLD = 20;
    const BURST_TIME_THRESHOLD_MS = 1000;
    const is_in_burst = new Array(records.length).fill(false);
    if (records.length >= BURST_COUNT_THRESHOLD) {
        for (let i = 0; i <= records.length - BURST_COUNT_THRESHOLD; i++) {
            try {
                const startTime = new Date(records[i].time).getTime();
                const endTime = new Date(records[i + BURST_COUNT_THRESHOLD - 1].time).getTime();
                if (isNaN(startTime) || isNaN(endTime)) continue;
                if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
                    for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
                        is_in_burst[j] = true;
                    }
                }
            } catch (e) { continue; }
        }
    }
    const cleanedRecords = [];
    const seen_contents = new Set();
    let removedCount = 0;
    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const content = record.content;
        const has_no_historical_flag = !record.is_historical;
        const is_duplicate = content != null && seen_contents.has(content);
        const in_burst = is_in_burst[i];
        const should_delete = has_no_historical_flag && is_duplicate && in_burst;
        if (!should_delete) {
            cleanedRecords.push(record);
        } else {
            removedCount++;
        }
        if (content != null) {
            seen_contents.add(content);
        }
    }
    return { cleanedRecords, removedCount };
}

/**
 * 检测所有频道中可被清理的重复记录总数。
 * @param {object} messagesByChannel - 包含所有频道消息的对象。
 * @returns {number} - 可被清理的记录总数。
 */
export function detectTotalDuplicates(messagesByChannel) {
    let totalDuplicates = 0;
    if (!messagesByChannel) return 0;
    for (const channel in messagesByChannel) {
        const records = messagesByChannel[channel];
        if (!records || records.length === 0) continue;
        const BURST_COUNT_THRESHOLD = 20;
        const BURST_TIME_THRESHOLD_MS = 1000;
        const is_in_burst = new Array(records.length).fill(false);
        if (records.length >= BURST_COUNT_THRESHOLD) {
            for (let i = 0; i <= records.length - BURST_COUNT_THRESHOLD; i++) {
                try {
                    const startTime = new Date(records[i].time).getTime();
                    const endTime = new Date(records[i + BURST_COUNT_THRESHOLD - 1].time).getTime();
                    if (isNaN(startTime) || isNaN(endTime)) continue;
                    if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
                        for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
                            is_in_burst[j] = true;
                        }
                    }
                } catch (e) { continue; }
            }
        }
        const seen_contents = new Set();
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const content = record.content;
            const has_no_historical_flag = !record.is_historical;
            const is_duplicate = content != null && seen_contents.has(content);
            const in_burst = is_in_burst[i];
            if (has_no_historical_flag && is_duplicate && in_burst) {
                totalDuplicates++;
            }
            if (content != null) {
                seen_contents.add(content);
            }
        }
    }
    return totalDuplicates;
}
~~~~~

#### Acts 2: 更新主入口文件以使用状态模块

现在，我们清理 `src/main.js`，让它依赖于新创建的 `state.js` 模块。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import { extractUsefulData, locateChatElements, findActiveTabByClass } from './parser.js';

(function() {
~~~~~
~~~~~javascript.new
import { extractUsefulData, locateChatElements, findActiveTabByClass } from './parser.js';
import { migrateDataV4toV5, mergeAndDeduplicateMessages, loadMessagesFromStorage, saveMessagesToStorage, addMessageToSyntheticChannelIfNeeded, cleanChannelRecords, detectTotalDuplicates } from './state.js';

(function() {
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
        const newlyAddedHistoricalMessages = newMergedMessages.slice(-messagesAddedCount);
        newlyAddedHistoricalMessages.forEach(msg => {
          // 注意：这里的 channelName 就是当时扫描时的活跃频道
          addMessageToSyntheticChannelIfNeeded(msg, channelName);
        });

        // 使用新的日志格式
~~~~~
~~~~~javascript.new
        const newlyAddedHistoricalMessages = newMergedMessages.slice(-messagesAddedCount);
        newlyAddedHistoricalMessages.forEach(msg => {
          // 注意：这里的 channelName 就是当时扫描时的活跃频道
          addMessageToSyntheticChannelIfNeeded(inMemoryChatState, msg, channelName);
        });

        // 使用新的日志格式
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    if (messageData && messageData.content) {
      if (!inMemoryChatState[currentActiveChannel]) {
        inMemoryChatState[currentActiveChannel] = [];
      }
      inMemoryChatState[currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(messageData, currentActiveChannel);
    }
~~~~~
~~~~~javascript.new
    if (messageData && messageData.content) {
      if (!inMemoryChatState[currentActiveChannel]) {
        inMemoryChatState[currentActiveChannel] = [];
      }
      inMemoryChatState[currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(inMemoryChatState, messageData, currentActiveChannel);
    }
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /*
   * =================================================================
   * 数据迁移模块
   * =================================================================
   */
  /**
   * 检查并执行一次性的数据迁移，将 v4 版本的数据转换为 v5 格式。
   * 主要处理时间戳格式的转换，并将所有旧数据标记为历史记录。
   */
  function migrateDataV4toV5() {
    const oldDataRaw = localStorage.getItem(OLD_STORAGE_KEY_V4);
    if (!oldDataRaw) return;

    console.log("检测到旧版本(v4)数据，正在执行一次性迁移...");
    try {
      const oldData = JSON.parse(oldDataRaw);
      const newData = {};

      for (const channel in oldData) {
        newData[channel] = oldData[channel].map(msg => {
          const newMsg = { ...msg };
          try {
            // v4 的时间格式 "YYYY-MM-DD HH:MM" 是本地时间，我们将其近似转换为 ISO 格式的 UTC 时间
            const localDate = new Date(msg.time.replace(/-/g, '/'));
            newMsg.time = localDate.toISOString();
          } catch (e) {
            newMsg.time = new Date().toISOString(); // 转换失败时使用当前时间作为备用
          }
          newMsg.is_historical = true;
          return newMsg;
        });
      }

      localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(newData));
      localStorage.removeItem(OLD_STORAGE_KEY_V4);
      console.log("数据迁移成功！");
    } catch (error) {
      console.error("数据迁移失败，旧数据可能已损坏，将予以保留。", error);
    }
  }

  /*
   * =================================================================
   * 核心功能模块
   * =================================================================
   */

  // --- 状态管理与持久化 ---

  /** 智能合并消息数组，用于处理聊天记录不连续的情况，例如在UI重现后。*/
  function mergeAndDeduplicateMessages(oldMessages, newMessages) {
    if (!oldMessages || oldMessages.length === 0) return newMessages;
    if (!newMessages || newMessages.length === 0) return oldMessages;
    const oldUserMessages = oldMessages.filter(msg => !msg.is_archiver);
    const newUserMessages = newMessages.filter(msg => !msg.is_archiver);
    let overlapLength = 0;
    const maxPossibleOverlap = Math.min(oldUserMessages.length, newUserMessages.length);
    for (let i = maxPossibleOverlap; i > 0; i--) {
      const suffixOfOld = oldUserMessages.slice(-i).map(msg => msg.content);
      const prefixOfNew = newUserMessages.slice(0, i).map(msg => msg.content);
      if (JSON.stringify(suffixOfOld) === JSON.stringify(prefixOfNew)) {
        overlapLength = i;
        break;
      }
    }
    let messagesToAdd;
    if (overlapLength > 0) {
      const lastOverlappingUserMessage = newUserMessages[overlapLength - 1];
      const lastOverlappingIndexInNew = newMessages.findIndex(msg => msg === lastOverlappingUserMessage);
      messagesToAdd = newMessages.slice(lastOverlappingIndexInNew + 1);
    } else {
      messagesToAdd = newMessages;
    }
    const discontinuityDetected = oldMessages.length > 0 && newMessages.length > 0 && overlapLength === 0;
    if (messagesToAdd.length === 0) return oldMessages;
    if (discontinuityDetected) {
      console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
      const discontinuityMark = {
        time: getISOTimestamp(), type: 'system', sender: 'Archiver', receiver: 'System',
        content: '[警告 - 此处可能存在记录丢失]', is_archiver: true
      };
      return oldMessages.concat([discontinuityMark], messagesToAdd);
    }
    return oldMessages.concat(messagesToAdd);
  }

  /** 扫描聊天框中已存在的消息，时间戳根据UI显示的 `HH:MM` 进行估算。*/
  function extractHistoricalChatState() {
    const elements = locateChatElements();
    if (!elements.tabs || !elements.chatLog) return { current_tab: null, messages: [] };

    const current_tab = findActiveTabByClass(elements.tabs.innerHTML);
    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const messages = [];
    const chatLines = Array.from(elements.chatLog.children);
    let currentDate = new Date();
    let lastTimeParts = null;

    for (let i = chatLines.length - 1; i >= 0; i--) {
      const element = chatLines[i];
      const timeNode = element.querySelector('.chat-line-timestamp');
      if (!timeNode || !timeNode.textContent.includes(':')) continue;

      const timeText = timeNode.textContent.trim();
      const [hours, minutes] = timeText.split(':').map(Number);
      // 处理跨天的情况
      if (lastTimeParts && (hours > lastTimeParts.hours || (hours === lastTimeParts.hours && minutes > lastTimeParts.minutes))) {
        currentDate.setDate(currentDate.getDate() - 1);
      }
      lastTimeParts = { hours, minutes };

      const localDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')} ${timeText}`;
      const isoTimeApproximation = new Date(localDateString.replace(/-/g, '/')).toISOString();

      const messageData = extractUsefulData(element, selfName, isoTimeApproximation);
      if (messageData && messageData.content) {
        messageData.is_historical = true; // 标记为历史消息
        messages.push(messageData);
      }
    }
    messages.reverse();
    return { current_tab, messages };
  }

  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   * 这是一个可被多处调用的核心同步功能。
   */
  function scanAndMergeHistory() {
    console.log("正在扫描并合并历史消息...");
    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      const messagesScannedCount = historicalState.messages.length; // Y: 检查了的历史记录总数

      const oldMessages = inMemoryChatState[channelName] || [];
      const oldMessageCount = oldMessages.length;

      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);
      const newMessageCount = newMergedMessages.length;

      const messagesAddedCount = newMessageCount - oldMessageCount; // X: 有效合并的新记录数

      if (messagesAddedCount > 0) {
        inMemoryChatState[channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(-messagesAddedCount);
        newlyAddedHistoricalMessages.forEach(msg => {
          // 注意：这里的 channelName 就是当时扫描时的活跃频道
          addMessageToSyntheticChannelIfNeeded(inMemoryChatState, msg, channelName);
        });

        // 使用新的日志格式
        console.log(`历史扫描 [${channelName}]: 合并了 ${messagesAddedCount}/${messagesScannedCount} 条新记录。`);
      } else {
        console.log(`历史扫描 [${channelName}]: 检查了 ${messagesScannedCount} 条记录，无新增内容。`);
      }
    }

    // 如果数据有变动，且UI是打开的，则刷新UI
    if (dataChanged) {
      const uiContainer = document.getElementById('log-archive-ui-container');
      const isUIPaused = uiContainer && uiContainer.querySelector('#log-archive-pause-button').textContent.includes('▶️');
      if (uiContainer && uiContainer.style.display === 'flex' && !isUIPaused) {
        const { updateUI: uiUpdateFn } = document.getElementById('log-archive-ui-container')._uiFunctions || {};
        if (uiUpdateFn) {
          uiUpdateFn(inMemoryChatState);
        }
      }
    }
  }

  /** 从 localStorage 加载存档。*/
  function loadMessagesFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_V5)) || {};
    } catch (e) {
      console.error('读取存档失败，数据已损坏。', e); return {};
    }
  }

  /** 将内存中的存档保存到 localStorage。*/
  function saveMessagesToStorage(messagesObject) {
    console.info('存档已保存到 localStorage')
    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(messagesObject));
  }

  /**
   * (新功能) 根据条件将消息添加到合成频道。
   * 如果当前活跃频道是 'Local'，并且消息是 party 或 whisper 类型，
   * 则将其复制一份到 'Party-Local' 或 'Whisper-Local' 频道。
   * @param {object} message - 消息数据对象。
   * @param {string} activeChannel - 消息产生时所在的活跃频道。
   */
  function addMessageToSyntheticChannelIfNeeded(message, activeChannel) {
    // 核心条件：当且仅当在 'Local' 频道时才触发
    if (activeChannel !== 'Local') {
      return;
    }

    let syntheticChannelName = null;
    if (message.type.includes('party')) {
      syntheticChannelName = 'Party-Local';
    } else if (message.type.includes('whisper')) {
      syntheticChannelName = 'Whisper-Local';
    }

    // 如果是 party 或 whisper 消息，则执行添加操作
    if (syntheticChannelName) {
      if (!inMemoryChatState[syntheticChannelName]) {
        inMemoryChatState[syntheticChannelName] = [];
      }
      // 创建消息的副本以避免任何潜在的引用问题
      inMemoryChatState[syntheticChannelName].push({ ...message });
      console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
    }
  }

  // --- 【新增】数据清理模块 ---
  
      /**
       * 根据 Python 脚本的逻辑，清理一个频道记录中的重复数据。
       * @param {Array<object>} records - 一个频道的聊天记录数组。
       * @returns {{cleanedRecords: Array<object>, removedCount: number}} - 清理后的记录和被移除的记录数。
       */
      function cleanChannelRecords(records) {
          if (!records || records.length === 0) {
              return { cleanedRecords: [], removedCount: 0 };
          }
  
          const BURST_COUNT_THRESHOLD = 20;
          const BURST_TIME_THRESHOLD_MS = 1000; // 1 second
  
          const is_in_burst = new Array(records.length).fill(false);
          if (records.length >= BURST_COUNT_THRESHOLD) {
              for (let i = 0; i <= records.length - BURST_COUNT_THRESHOLD; i++) {
                  try {
                      const startTime = new Date(records[i].time).getTime();
                      const endTime = new Date(records[i + BURST_COUNT_THRESHOLD - 1].time).getTime();
                      if (isNaN(startTime) || isNaN(endTime)) continue;
  
                      if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
                          for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
                              is_in_burst[j] = true;
                          }
                      }
                  } catch (e) { continue; }
              }
          }
  
          const cleanedRecords = [];
          const seen_contents = new Set();
          let removedCount = 0;
  
          for (let i = 0; i < records.length; i++) {
              const record = records[i];
              const content = record.content;
              const has_no_historical_flag = !record.is_historical;
              const is_duplicate = content != null && seen_contents.has(content);
              const in_burst = is_in_burst[i];
              const should_delete = has_no_historical_flag && is_duplicate && in_burst;
  
              if (!should_delete) {
                  cleanedRecords.push(record);
              } else {
                  removedCount++;
              }
  
              if (content != null) {
                  seen_contents.add(content);
              }
          }
          return { cleanedRecords, removedCount };
      }
  
      /**
       * 检测所有频道中可被清理的重复记录总数。
       * @param {object} messagesByChannel - 包含所有频道消息的对象。
       * @returns {number} - 可被清理的记录总数。
       */
      function detectTotalDuplicates(messagesByChannel) {
          let totalDuplicates = 0;
          if (!messagesByChannel) return 0;
  
          for (const channel in messagesByChannel) {
              const records = messagesByChannel[channel];
              if (!records || records.length === 0) continue;
  
              const BURST_COUNT_THRESHOLD = 20;
              const BURST_TIME_THRESHOLD_MS = 1000;
  
              const is_in_burst = new Array(records.length).fill(false);
              if (records.length >= BURST_COUNT_THRESHOLD) {
                  for (let i = 0; i <= records.length - BURST_COUNT_THRESHOLD; i++) {
                      try {
                          const startTime = new Date(records[i].time).getTime();
                          const endTime = new Date(records[i + BURST_COUNT_THRESHOLD - 1].time).getTime();
                          if (isNaN(startTime) || isNaN(endTime)) continue;
                          if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
                              for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
                                  is_in_burst[j] = true;
                              }
                          }
                      } catch (e) { continue; }
                  }
              }
  
              const seen_contents = new Set();
              for (let i = 0; i < records.length; i++) {
                  const record = records[i];
                  const content = record.content;
                  const has_no_historical_flag = !record.is_historical;
                  const is_duplicate = content != null && seen_contents.has(content);
                  const in_burst = is_in_burst[i];
  
                  if (has_no_historical_flag && is_duplicate && in_burst) {
                      totalDuplicates++;
                  }
  
                  if (content != null) {
                      seen_contents.add(content);
                  }
              }
          }
          return totalDuplicates;
      }
  
  
      /*
   * =================================================================
   * 用户交互界面 (UI) 模块
   * =================================================================
   */
~~~~~
~~~~~javascript.new
  /*
   * =================================================================
   * 核心功能模块
   * =================================================================
   */

  /** 扫描聊天框中已存在的消息，时间戳根据UI显示的 `HH:MM` 进行估算。*/
  function extractHistoricalChatState() {
    const elements = locateChatElements();
    if (!elements.tabs || !elements.chatLog) return { current_tab: null, messages: [] };

    const current_tab = findActiveTabByClass(elements.tabs.innerHTML);
    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const messages = [];
    const chatLines = Array.from(elements.chatLog.children);
    let currentDate = new Date();
    let lastTimeParts = null;

    for (let i = chatLines.length - 1; i >= 0; i--) {
      const element = chatLines[i];
      const timeNode = element.querySelector('.chat-line-timestamp');
      if (!timeNode || !timeNode.textContent.includes(':')) continue;

      const timeText = timeNode.textContent.trim();
      const [hours, minutes] = timeText.split(':').map(Number);
      // 处理跨天的情况
      if (lastTimeParts && (hours > lastTimeParts.hours || (hours === lastTimeParts.hours && minutes > lastTimeParts.minutes))) {
        currentDate.setDate(currentDate.getDate() - 1);
      }
      lastTimeParts = { hours, minutes };

      const localDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')} ${timeText}`;
      const isoTimeApproximation = new Date(localDateString.replace(/-/g, '/')).toISOString();

      const messageData = extractUsefulData(element, selfName, isoTimeApproximation);
      if (messageData && messageData.content) {
        messageData.is_historical = true; // 标记为历史消息
        messages.push(messageData);
      }
    }
    messages.reverse();
    return { current_tab, messages };
  }

  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   * 这是一个可被多处调用的核心同步功能。
   */
  function scanAndMergeHistory() {
    console.log("正在扫描并合并历史消息...");
    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      const messagesScannedCount = historicalState.messages.length; // Y: 检查了的历史记录总数

      const oldMessages = inMemoryChatState[channelName] || [];
      const oldMessageCount = oldMessages.length;

      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);
      const newMessageCount = newMergedMessages.length;

      const messagesAddedCount = newMessageCount - oldMessageCount; // X: 有效合并的新记录数

      if (messagesAddedCount > 0) {
        inMemoryChatState[channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(-messagesAddedCount);
        newlyAddedHistoricalMessages.forEach(msg => {
          // 注意：这里的 channelName 就是当时扫描时的活跃频道
          addMessageToSyntheticChannelIfNeeded(inMemoryChatState, msg, channelName);
        });

        // 使用新的日志格式
        console.log(`历史扫描 [${channelName}]: 合并了 ${messagesAddedCount}/${messagesScannedCount} 条新记录。`);
      } else {
        console.log(`历史扫描 [${channelName}]: 检查了 ${messagesScannedCount} 条记录，无新增内容。`);
      }
    }

    // 如果数据有变动，且UI是打开的，则刷新UI
    if (dataChanged) {
      const uiContainer = document.getElementById('log-archive-ui-container');
      const isUIPaused = uiContainer && uiContainer.querySelector('#log-archive-pause-button').textContent.includes('▶️');
      if (uiContainer && uiContainer.style.display === 'flex' && !isUIPaused) {
        const { updateUI: uiUpdateFn } = document.getElementById('log-archive-ui-container')._uiFunctions || {};
        if (uiUpdateFn) {
          uiUpdateFn(inMemoryChatState);
        }
      }
    }
  }

  /*
   * =================================================================
   * 用户交互界面 (UI) 模块
   * =================================================================
   */
~~~~~

### 下一步建议
- **代码审查与验证**: 这是个大改动，请务必运行 `npm run watch` 并仔细测试脚本的各项功能，特别是：数据迁移（如果还有旧数据）、历史记录合并、实时记录、合成频道以及数据清理功能是否都正常。
- **拆分 UI 模块**: 当你确认一切正常后，我们将进行最后一步大拆分：将庞大的 `createUI` 函数及其所有相关的辅助函数（如统计、格式化）提取到 `src/ui.js` 中。这将是我们模块化重构的收官之作。

**请在测试完成后通知我。**
