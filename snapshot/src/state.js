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
export function mergeAndDeduplicateMessages(oldMessages, newMessages) {
  if (!oldMessages || oldMessages.length === 0) return newMessages;
  if (!newMessages || newMessages.length === 0) return oldMessages;
  const oldUserMessages = oldMessages.filter((msg) => !msg.is_archiver);
  const newUserMessages = newMessages.filter((msg) => !msg.is_archiver);
  let overlapLength = 0;
  const maxPossibleOverlap = Math.min(oldUserMessages.length, newUserMessages.length);
  for (let i = maxPossibleOverlap; i > 0; i--) {
    const suffixOfOld = oldUserMessages.slice(-i).map((msg) => msg.content);
    const prefixOfNew = newUserMessages.slice(0, i).map((msg) => msg.content);
    if (JSON.stringify(suffixOfOld) === JSON.stringify(prefixOfNew)) {
      overlapLength = i;
      break;
    }
  }
  let messagesToAdd;
  if (overlapLength > 0) {
    const lastOverlappingUserMessage = newUserMessages[overlapLength - 1];
    const lastOverlappingIndexInNew = newMessages.findIndex(
      (msg) => msg === lastOverlappingUserMessage,
    );
    messagesToAdd = newMessages.slice(lastOverlappingIndexInNew + 1);
  } else {
    messagesToAdd = newMessages;
  }
  const discontinuityDetected =
    oldMessages.length > 0 && newMessages.length > 0 && overlapLength === 0;
  if (messagesToAdd.length === 0) return oldMessages;
  if (discontinuityDetected) {
    console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
    const discontinuityMark = {
      time: getISOTimestamp(),
      type: 'system',
      sender: 'Archiver',
      receiver: 'System',
      content: '[警告 - 此处可能存在记录丢失]',
      is_archiver: true,
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
        if (Number.isNaN(startTime) || Number.isNaN(endTime)) continue;
        if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
          for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
            is_in_burst[j] = true;
          }
        }
      } catch (e) {
        // Biome: unnecessary continue
      }
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
          if (Number.isNaN(startTime) || Number.isNaN(endTime)) continue;
          if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
            for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
              is_in_burst[j] = true;
            }
          }
        } catch (e) {
          // Biome: unnecessary continue
        }
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
