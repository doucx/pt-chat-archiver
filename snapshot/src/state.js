import { OLD_STORAGE_KEY_V4, STORAGE_KEY_V5, STORAGE_KEY_V6 } from './constants.js';
import { getISOTimestamp } from './utils.js';

/**
 * 检查并执行一次性的数据迁移，将 v4 版本的数据转换为 v5 格式。
 * @deprecated 将在 v6 稳定后移除
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

    // 注意：这里迁移到 v5 key，以便后续的 v5->v6 迁移可以接管
    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(newData));
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
    console.log('v4 -> v5 数据迁移成功！');
  } catch (error) {
    console.error('v4 -> v5 数据迁移失败，旧数据可能已损坏，将予以保留。', error);
  }
}

/**
 * 核心迁移函数：将 v5 数据迁移到 v6 结构中指定服务器的命名空间下。
 * @param {string} targetServerName - 用户选择要将旧数据归档到的服务器名称。
 * @returns {object|null} - 成功则返回更新后的 v6 数据对象，否则返回 null。
 */
export function migrateDataV5toV6(targetServerName) {
  const v5DataRaw = localStorage.getItem(STORAGE_KEY_V5);
  if (!v5DataRaw) return null;

  console.log(`检测到 v5 数据，开始迁移到服务器 [${targetServerName}]...`);
  try {
    const v5Data = JSON.parse(v5DataRaw);
    const v6Data = loadMessagesFromStorage(); // 加载现有的 v6 数据

    const existingServerData = v6Data[targetServerName] || {};

    // 合并策略：遍历 v5 的每个频道，并将其与 v6 中对应服务器的频道合并
    for (const channelName in v5Data) {
      const v5ChannelMessages = v5Data[channelName];
      const v6ChannelMessages = existingServerData[channelName] || [];
      existingServerData[channelName] = mergeAndDeduplicateMessages(
        v6ChannelMessages,
        v5ChannelMessages,
      );
    }
    v6Data[targetServerName] = existingServerData;

    saveMessagesToStorage(v6Data);
    localStorage.removeItem(STORAGE_KEY_V5); // 关键步骤：防止重复迁移
    console.log('v5 -> v6 数据迁移成功！');
    return v6Data; // 返回最新的完整数据
  } catch (error) {
    console.error('v5 -> v6 数据迁移失败!', error);
    return null;
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

/** 从 localStorage 加载 V6 存档。*/
export function loadMessagesFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_V6)) || {};
  } catch (e) {
    console.error('读取 V6 存档失败，数据已损坏。', e);
    return {};
  }
}

/** 将内存中的 V6 存档保存到 localStorage。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('V6 存档已保存到 localStorage');
  localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(messagesObject));
}

/**
 * 根据条件将消息添加到合成频道。
 * @param {object} channelMap - 当前服务器的频道-消息映射 (e.g., inMemoryChatState[serverName])。
 * @param {object} message - 消息数据对象。
 * @param {string} activeChannel - 消息产生时所在的活跃频道。
 */
export function addMessageToSyntheticChannelIfNeeded(channelMap, message, activeChannel) {
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
    if (!channelMap[syntheticChannelName]) {
      channelMap[syntheticChannelName] = [];
    }
    channelMap[syntheticChannelName].push({ ...message });
    console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
  }
}