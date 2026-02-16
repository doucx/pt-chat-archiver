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

  // 3. 重叠检测 (Overlap Detection)
  let overlapLength = 0;
  const maxPossibleOverlap = Math.min(oldSigs.length, newSigs.length);

  for (let i = maxPossibleOverlap; i > 0; i--) {
    // 比较 old 的后缀 和 new 的前缀
    const suffixSigs = oldSigs.slice(-i);
    const prefixSigs = newSigs.slice(0, i);

    // 简单的数组比较
    let match = true;
    for (let k = 0; k < i; k++) {
      if (suffixSigs[k] !== prefixSigs[k]) {
        match = false;
        break;
      }
    }

    if (match) {
      overlapLength = i;
      break;
    }
  }

  // 4. 合并结果
  let messagesToAdd;
  if (overlapLength > 0) {
    // 找到重叠，取 newMessages 中重叠部分之后的消息
    // 注意：我们需要回到原始的 newMessages 数组（包含可能的 archiver 标记，虽然 filter 过了通常没有）
    // 为了简单，我们使用 newUserMessages 的索引来切分 newMessages
    // 但 newMessages 可能包含我们 filter 掉的东西吗？
    // extractHistoricalChatState 生成的消息通常不含 is_archiver。
    // 所以直接用 newUserMessages 的逻辑是安全的。

    // 找到重叠截止点在 newMessages 中的位置
    const lastOverlappingMsg = newUserMessages[overlapLength - 1];
    // 在原始 newMessages 中找到这个消息
    const indexInOriginal = newMessages.indexOf(lastOverlappingMsg);

    if (indexInOriginal !== -1) {
      messagesToAdd = newMessages.slice(indexInOriginal + 1);
    } else {
      // Fallback (should ideally not happen)
      messagesToAdd = newMessages.slice(overlapLength);
    }
  } else {
    messagesToAdd = newMessages;
  }

  if (messagesToAdd.length === 0) return oldMessages;

  const discontinuityDetected = overlapLength === 0;

  if (discontinuityDetected) {
    // 进一步检查：如果只是 overlap 没找到，但时间上是连续的（或者是旧数据的未来），
    // 且我们没有更好的办法判断，才插入标记。
    // 防止“完全不匹配但其实是同一波数据的微调”导致的重复。
    // 但鉴于我们做了子集检测，如果走到这里，说明 new 有 old 没有的内容，且头部不匹配 old 的尾部。
    // 这确实像是一个断层。
    console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
    const discontinuityMark = {
      time: getISOTimestamp(),
      type: 'system',
      sender: 'Archiver',
      receiver: 'System',
      content: '[警告 - 此处可能存在记录丢失]',
      is_archiver: true,
    };
    return ensureIdMonotonicity(oldMessages.concat([discontinuityMark], messagesToAdd));
  }

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

    // 简单的字符串字典序比较
    if (lastId && msg.id < lastId) {
      const prevMsg = messages[i - 1];
      const prevTime = new Date(prevMsg.time).getTime();
      const currTime = new Date(msg.time).getTime();

      // 新的时间戳必须至少比上一条大 1ms，同时也尽量贴近当前记录的时间
      const newSeedTime = Math.max(prevTime, currTime) + 1;

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
