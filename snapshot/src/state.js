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
 * 改进版：增加了子集检测和模糊匹配。
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

  // 2. 子集检测 (Subset Check)
  // 检查 newMessages 是否完全包含在 oldMessages 的末尾
  // 例如: Old=[A, B, C, D], New=[C, D]. 这是一个常见的重新扫描场景。
  if (newSigs.length <= oldSigs.length) {
    let isSubset = true;
    for (let i = 0; i < newSigs.length; i++) {
      if (newSigs[i] !== oldSigs[oldSigs.length - newSigs.length + i]) {
        isSubset = false;
        break;
      }
    }
    if (isSubset) {
      // console.log('[Archiver] 扫描到的消息是当前记录的子集，忽略。');
      return oldMessages;
    }
  }

  // 3. 贪心对齐检测 (Greedy Alignment Detection)
  // 从后向前比较，容忍旧数据中的缺失空洞
  let i = oldSigs.length - 1;
  let j = newSigs.length - 1;
  const missingIndices = [];
  let anyMatchFound = false;

  while (j >= 0) {
    if (i >= 0 && oldSigs[i] === newSigs[j]) {
      anyMatchFound = true;
      i--;
      j--;
    } else {
      let foundInOld = -1;
      let foundInNew = -1;

      // 往前探查一小段，确认是哪一侧少了一截
      for (let k = 1; k <= 5 && i - k >= 0; k++) {
        if (oldSigs[i - k] === newSigs[j]) {
          foundInOld = i - k;
          break;
        }
      }
      for (let k = 1; k <= 5 && j - k >= 0; k++) {
        if (i >= 0 && newSigs[j - k] === oldSigs[i]) {
          foundInNew = j - k;
          break;
        }
      }

      if (foundInOld !== -1 && foundInNew === -1) {
        // DB 里有多余的东西（比如以前错误的重复插入），跳过它们
        i = foundInOld;
      } else if (foundInNew !== -1 && foundInOld === -1) {
        // DOM 里有新的、DB 漏掉的消息
        missingIndices.push(j);
        j--;
      } else {
        // 两边都没找到，默认 DOM 里的是新产生的未记录消息
        missingIndices.push(j);
        j--;
      }
    }
  }

  // 恢复正向的时间顺序
  missingIndices.reverse();
  const messagesToAdd = missingIndices.map((idx) => newUserMessages[idx]);

  if (messagesToAdd.length === 0) return oldMessages;

  // 只有当两个数组没有任何交集时，才真正认定发生了不可恢复的断层
  const discontinuityDetected = !anyMatchFound;

  if (discontinuityDetected && oldSigs.length > 0) {
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
    return ensureIdMonotonicity(oldMessages.concat([discontinuityMark], messagesToAdd));
  }

  // 利用 ensureIdMonotonicity，所有新增历史记录的 ID 和 Time 将被安全地推挤
  // 从而使得这些补漏记录会被安插在正确的时间线位置（最后一条有效记录之后）
  return ensureIdMonotonicity(oldMessages.concat(messagesToAdd));
}

/**
 * 确保消息列表中的 ID 是单调递增的。
 * 如果发现后一条消息的 ID 小于前一条，则重写后一条的 ID。
 */
function ensureIdMonotonicity(messages) {
  if (!messages || messages.length === 0) return messages;

  let lastId = null;
  // let fixedCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // 防御：确保 time 存在且有效
    if (!msg.time || Number.isNaN(new Date(msg.time).getTime())) {
      msg.time = getISOTimestamp();
    }

    if (!msg.id) {
      msg.id = generateULID(new Date(msg.time).getTime());
    }

    // 简单的字符串字典序比较
    if (lastId && msg.id < lastId) {
      const prevMsg = messages[i - 1];
      const prevTime = new Date(prevMsg.time).getTime() || Date.now();
      const currTime = new Date(msg.time).getTime() || Date.now();

      // 新的时间戳必须至少比上一条大 1ms，同时也尽量贴近当前记录的时间
      const newSeedTime = (Number.isNaN(prevTime) ? Date.now() : Math.max(prevTime, currTime)) + 1;

      // 重写 ID
      msg.id = generateULID(newSeedTime);
      // 同步更新 time 以保持数据内部一致性 (尽管 UI 可能显示旧时间，但排序依据已变)
      // 注意：这会改变内存中的 time 对象，可能会影响 UI 显示为 x.001 秒
      // 但这是正确的，反映了它逻辑上发生在上一条之后。
      msg.time = new Date(newSeedTime).toISOString();

      // fixedCount++;
    }
    lastId = msg.id;
  }

  // if (fixedCount > 0) console.log(`[Archiver] Fixed ${fixedCount} out-of-order IDs during merge.`);
  return messages;
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
