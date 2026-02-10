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
