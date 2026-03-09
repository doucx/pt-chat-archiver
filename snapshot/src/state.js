import { generateULID, getISOTimestamp } from './utils.js';

/**
 * 生成用于比较的消息签名。
 * 忽略时间戳精度差异，仅关注核心内容。
 */
function getMessageSignature(msg) {
  if (!msg) return '';
  // 如果是系统断层标记，则视为不可见，不生成签名（或生成特殊签名）
  // 但在这里我们主要是为了比较内容，所以只取 content 和 sender
  return `${msg.sender || '?'}:${msg.content || ''}`;
}

/**
 * 智能合并消息数组，用于处理聊天记录不连续的情况。
 * 改进版：使用“拉链式”精准缝合，避免级联 ID 重写造成的 IndexedDB 冗余。
 */
export function mergeAndDeduplicateMessages(oldMessages, newMessages) {
  if (!oldMessages || oldMessages.length === 0) return newMessages;
  if (!newMessages || newMessages.length === 0) return oldMessages;

  const oldUserMessages = oldMessages.filter((msg) => !msg.is_archiver);
  const newUserMessages = newMessages.filter((msg) => !msg.is_archiver);

  if (newUserMessages.length === 0) return oldMessages;

  // 1. 提取签名序列
  const oldSigs = oldUserMessages.map(getMessageSignature);
  const newSigs = newUserMessages.map(getMessageSignature);

  // 2. 子集检测优化 (Subset Check)
  if (newSigs.length <= oldSigs.length) {
    let isSubset = true;
    for (let i = 0; i < newSigs.length; i++) {
      if (newSigs[i] !== oldSigs[oldSigs.length - newSigs.length + i]) {
        isSubset = false;
        break;
      }
    }
    if (isSubset) {
      return oldMessages;
    }
  }

  // 3. 贪心对齐检测 (Greedy Alignment) - 定位缺失记录的插入点
  const insertions = []; // { afterOldUserIndex: number, msg: object }
  let i = oldSigs.length - 1;
  let j = newSigs.length - 1;
  let anyMatchFound = false;
  const MAX_LOOKAHEAD = 50; // 扩大探查视野以防大量积压导致误判

  while (i >= 0 || j >= 0) {
    if (i >= 0 && j >= 0 && oldSigs[i] === newSigs[j]) {
      anyMatchFound = true;
      i--;
      j--;
    } else {
      let foundInOld = -1;
      let foundInNew = -1;

      // 探查缺失情况
      for (let k = 1; k <= MAX_LOOKAHEAD; k++) {
        if (foundInOld === -1 && i - k >= 0 && j >= 0 && oldSigs[i - k] === newSigs[j]) {
          foundInOld = k;
        }
        if (foundInNew === -1 && j - k >= 0 && i >= 0 && newSigs[j - k] === oldSigs[i]) {
          foundInNew = k;
        }
        if (foundInOld !== -1 || foundInNew !== -1) {
          break;
        }
      }

      if (foundInOld !== -1 && foundInNew === -1) {
        // DB 中有多余元素，说明它们已经被安全归档，跳过匹配
        i -= foundInOld;
        anyMatchFound = true;
      } else if (foundInNew !== -1 && foundInOld === -1) {
        // DOM 中有新元素缺失，将它们记录并安排插入到当前匹配节点(i)的后方
        for (let step = 0; step < foundInNew; step++) {
          insertions.unshift({ afterOldUserIndex: i, msg: newUserMessages[j - step] });
        }
        j -= foundInNew;
        anyMatchFound = true;
      } else if (foundInOld !== -1 && foundInNew !== -1) {
        // 两边都找到了匹配（可能有重复字符），优先选用偏移较小的
        if (foundInOld <= foundInNew) {
          i -= foundInOld;
        } else {
          for (let step = 0; step < foundInNew; step++) {
            insertions.unshift({ afterOldUserIndex: i, msg: newUserMessages[j - step] });
          }
          j -= foundInNew;
        }
        anyMatchFound = true;
      } else {
        // 无法在视野内找到匹配，默认当前 j 属于缺失消息
        if (j >= 0) {
          insertions.unshift({ afterOldUserIndex: i, msg: newUserMessages[j] });
          j--;
        } else if (i >= 0) {
          i--;
        }
      }
    }
  }

  // 4. 按插入点对缺失消息进行分组
  const insertionsMap = new Map();
  for (const item of insertions) {
    if (!insertionsMap.has(item.afterOldUserIndex)) {
      insertionsMap.set(item.afterOldUserIndex, []);
    }
    insertionsMap.get(item.afterOldUserIndex).push(item.msg);
  }

  // 5. 插入断层警告标记 (如果有)
  if (!anyMatchFound && oldSigs.length > 0 && newSigs.length > 0) {
    console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
    const markTime = getISOTimestamp();
    const discontinuityMark = {
      id: generateULID(new Date(markTime).getTime()),
      time: markTime,
      type: 'system',
      sender: 'Archiver',
      receiver: 'System',
      content: '[警告 - 此处可能存在记录丢失]',
      is_archiver: true,
    };

    // 将其放置在旧记录的最末尾，即全部新消息之前
    const targetIdx = oldSigs.length - 1;
    if (!insertionsMap.has(targetIdx)) {
      insertionsMap.set(targetIdx, []);
    }
    insertionsMap.get(targetIdx).unshift(discontinuityMark);
  }

  if (insertionsMap.size === 0) {
    return oldMessages;
  }

  // 6. 构造最终的序列，精确织入新消息并进行局部时间插值
  const finalMessages = [];

  // 首先处理插在最开头的消息 (afterOldUserIndex === -1)
  if (insertionsMap.has(-1)) {
    const toInsert = insertionsMap.get(-1);
    let baseTime = new Date(toInsert[0].time || getISOTimestamp()).getTime();
    for (const newMsg of toInsert) {
      if (!newMsg.is_archiver) {
        newMsg.time = new Date(baseTime).toISOString();
        newMsg.id = generateULID(baseTime);
        baseTime += 1; // 保证微观单调性
      }
      finalMessages.push(newMsg);
    }
  }

  let currentUserIndex = 0;
  for (let idx = 0; idx < oldMessages.length; idx++) {
    const msg = oldMessages[idx];
    finalMessages.push(msg); // 已有的 DB 消息绝对不修改，避免引发冗余

    if (!msg.is_archiver) {
      if (insertionsMap.has(currentUserIndex)) {
        const toInsert = insertionsMap.get(currentUserIndex);
        let baseTime = new Date(msg.time).getTime();
        for (const newMsg of toInsert) {
          if (!newMsg.is_archiver) {
            baseTime += 1; // 在基准消息的时间上加 1ms，确保 IndexedDB 正确向后排序
            newMsg.time = new Date(baseTime).toISOString();
            newMsg.id = generateULID(baseTime);
          }
          finalMessages.push(newMsg);
        }
      }
      currentUserIndex++;
    }
  }

  return finalMessages;
}

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
  }
  if (message.type.includes('whisper')) {
    return 'Whisper-Local';
  }
  return null;
}
