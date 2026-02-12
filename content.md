这个问题的核心在于：**DOM 扫描（近似时间）与 内存记录（精确时间/DOM变化）之间的不一致，导致“完美重叠检测”失效**。一旦检测失效，脚本就会认为这是一段全新的历史，从而重复插入，并附带一个“断层标记”，这进一步破坏了后续的去重逻辑。

以下是针对性的修复计划：

1.  **修复“治标”的清洁工 (`src/analysis.js`)**：
    *   **忽略干扰项**：在检测重复（Burst Detection）时，彻底跳过 `is_archiver` (断层标记) 消息。这样即使两条重复记录中间夹了一个标记，清洁工也能识别出它们是重复的。

2.  **修复“治本”的合并逻辑 (`src/state.js`)**：
    *   **引入子集检测 (Subset Check)**：在尝试复杂的重叠拼接之前，先检查一个简单的情况：`newMessages`（扫描到的）是否已经是 `oldMessages`（内存中）的**子集**？
        *   如果是（即：扫描到的每一条消息都已经在内存的末尾存在），直接丢弃 `newMessages`。这能防御 90% 的“页面刷新/Tab切换”导致的重复加载。
    *   **增强比较健壮性**：比较消息时，不再使用 `JSON.stringify`（因为时间戳精度不同），而是使用 `Sender + Content` 的组合签名。
    *   **优化断层标记策略**：只有当新消息的时间明显晚于旧消息（确实是断层），或者确实没有任何重叠时，才插入标记。如果时间重叠但内容不匹配（疑似重复但不完全一致），则倾向于保守策略（不插入标记，或者记录为潜在冲突），但为了简单起见，我们先用“子集检测”来规避大部分此类情况。

[简要回答]
我们将通过三个层面解决此问题：1. 让分析模块在清理重复时忽略系统标记；2. 在合并状态时引入“子集检测”以直接丢弃已存在的扫描结果；3. 降低合并比较的敏感度，忽略时间戳精度的微小差异。

## [WIP] fix(core): 增强消息合并算法与重复清理逻辑

### 错误分析
当前系统存在“重复加载”和“检测失效”的恶性循环：
1.  **触发源**：当 `extractHistoricalChatState` 扫描 DOM 时，生成的消息时间戳是基于 `HH:MM` 的估算值，而内存中由 `MutationObserver` 捕获的消息是精确的 `ISO` 时间。
2.  **合并失败**：`mergeAndDeduplicateMessages` 使用 `JSON.stringify` 比较整个消息对象。由于时间戳或微小的 DOM 属性差异，**完全相同的消息被判定为不同**。
3.  **重复插入**：由于重叠长度为 0，旧数据和新数据被简单拼接，中间插入了 `[警告 - 此处可能存在记录丢失]`。
4.  **清理失效**：`analysis.js` 中的重复检测算法没有忽略这个警告标记。导致重复的数据块被标记隔开，算法认为它们不连续，因此无法自动清理。

### 用户需求
1.  **治本**：防止因 DOM 扫描和内存状态不一致导致的重复数据插入。
2.  **治标**：让“清理重复”功能能够穿透“断层标记”，识别并清理被标记分隔的重复数据。

### 评论
“子集检测”是一个非常高性价比的防御措施。因为在大多数情况下（如切换 Tab），扫描到的内容必然是内存中已记录内容的子集。只要确认了这一点，就可以直接忽略扫描结果，彻底避免脏数据的产生。

### 目标
1.  修改 `src/analysis.js`，使去重算法忽略 `is_archiver` 类型的消息。
2.  修改 `src/state.js`，实现基于 `content + sender` 签名的比较，而非全对象比较。
3.  在合并前增加“子集检测”，如果新数据完全包含在旧数据末尾，则不做任何操作。

### 基本原理
-   **鲁棒性比较**：`HH:MM` 和 `ISO String` 无法直接相等。在判断“是否是同一条消息”时，应仅比较 `content` 和 `sender`。
-   **子集优先**：如果 `New` 是 `Old` 的后缀（Suffix），说明我们只是重新读取了已知的历史，此时不应执行任何“拼接”或“断层判断”，直接返回 `Old` 即可。

### 标签
#intent/fix #intent/refine #flow/ready #priority/critical #comp/engine #concept/state #scope/core #ai/instruct #task/domain/storage #task/object/deduplication-logic #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 修复分析模块 (Cleaner)

让重复检测算法忽略归档器的系统消息。

~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript.old
function identifyBurstDuplicates(records) {
  if (!records || records.length === 0) return { is_in_burst: [], seen_contents: new Set() };
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
      } catch (e) {}
    }
  }
  return is_in_burst;
}

/**
 * 清理一个频道记录中的重复数据。
 */
export function cleanChannelRecords(records) {
  if (!records || records.length === 0) return { cleanedRecords: [], removedCount: 0 };
  const is_in_burst = identifyBurstDuplicates(records);
  const cleanedRecords = [];
  const seen_contents = new Set();
  let removedCount = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const content = record.content;
    const is_duplicate = content != null && seen_contents.has(content);
    const should_delete = !record.is_historical && is_duplicate && is_in_burst[i];
    if (!should_delete) {
      cleanedRecords.push(record);
    } else {
      removedCount++;
    }
    if (content != null) seen_contents.add(content);
  }
  return { cleanedRecords, removedCount };
}

/**
 * 检测所有频道中可被清理的重复记录总数。
 */
export function detectTotalDuplicates(messagesByChannel) {
  let totalDuplicates = 0;
  if (!messagesByChannel) return 0;
  for (const channel in messagesByChannel) {
    const records = messagesByChannel[channel];
    if (!records || records.length === 0) continue;
    const is_in_burst = identifyBurstDuplicates(records);
    const seen_contents = new Set();
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const content = record.content;
      if (
        !record.is_historical &&
        content != null &&
        seen_contents.has(content) &&
        is_in_burst[i]
      ) {
        totalDuplicates++;
      }
      if (content != null) seen_contents.add(content);
    }
  }
  return totalDuplicates;
}
~~~~~
~~~~~javascript.new
function identifyBurstDuplicates(records) {
  if (!records || records.length === 0) return { is_in_burst: [], seen_contents: new Set() };
  const BURST_COUNT_THRESHOLD = 20;
  const BURST_TIME_THRESHOLD_MS = 1000;
  const is_in_burst = new Array(records.length).fill(false);
  
  // 过滤掉 archiver 消息，仅基于用户消息计算 Burst
  // 我们通过映射索引来回填 is_in_burst 数组
  const userMsgIndices = [];
  for(let i=0; i<records.length; i++) {
      if (!records[i].is_archiver) userMsgIndices.push(i);
  }

  if (userMsgIndices.length >= BURST_COUNT_THRESHOLD) {
    for (let k = 0; k <= userMsgIndices.length - BURST_COUNT_THRESHOLD; k++) {
      try {
        const startIdx = userMsgIndices[k];
        const endIdx = userMsgIndices[k + BURST_COUNT_THRESHOLD - 1];
        
        const startTime = new Date(records[startIdx].time).getTime();
        const endTime = new Date(records[endIdx].time).getTime();
        
        if (Number.isNaN(startTime) || Number.isNaN(endTime)) continue;
        
        if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
          // 标记这一段范围内的所有用户消息
          for (let m = k; m < k + BURST_COUNT_THRESHOLD; m++) {
            is_in_burst[userMsgIndices[m]] = true;
          }
        }
      } catch (e) {}
    }
  }
  return is_in_burst;
}

/**
 * 清理一个频道记录中的重复数据。
 */
export function cleanChannelRecords(records) {
  if (!records || records.length === 0) return { cleanedRecords: [], removedCount: 0 };
  const is_in_burst = identifyBurstDuplicates(records);
  const cleanedRecords = [];
  const seen_contents = new Set();
  let removedCount = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    
    // 彻底忽略 archiver 消息，它们不参与重复检测，也不应该阻断 content 的连续性判断
    if (record.is_archiver) {
        cleanedRecords.push(record);
        continue;
    }

    const content = record.content;
    const is_duplicate = content != null && seen_contents.has(content);
    // 只有非历史导入的、且处于爆发期的重复消息才会被删除
    const should_delete = !record.is_historical && is_duplicate && is_in_burst[i];
    
    if (!should_delete) {
      cleanedRecords.push(record);
    } else {
      removedCount++;
    }
    
    if (content != null) seen_contents.add(content);
  }
  return { cleanedRecords, removedCount };
}

/**
 * 检测所有频道中可被清理的重复记录总数。
 */
export function detectTotalDuplicates(messagesByChannel) {
  let totalDuplicates = 0;
  if (!messagesByChannel) return 0;
  for (const channel in messagesByChannel) {
    const records = messagesByChannel[channel];
    if (!records || records.length === 0) continue;
    const is_in_burst = identifyBurstDuplicates(records);
    const seen_contents = new Set();
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.is_archiver) continue; // 忽略标记

      const content = record.content;
      if (
        !record.is_historical &&
        content != null &&
        seen_contents.has(content) &&
        is_in_burst[i]
      ) {
        totalDuplicates++;
      }
      if (content != null) seen_contents.add(content);
    }
  }
  return totalDuplicates;
}
~~~~~

#### Acts 2: 修复状态管理模块 (Merger)

重写 `mergeAndDeduplicateMessages`，加入子集检测和签名比较。

~~~~~act
write_file
src/state.js
~~~~~
~~~~~javascript
import { getISOTimestamp } from './utils.js';

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
    for(let k=0; k<i; k++) {
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
    return oldMessages.concat([discontinuityMark], messagesToAdd);
  }

  return oldMessages.concat(messagesToAdd);
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
~~~~~

### 下一步建议

现在我们已经不仅修复了清洁工，还通过“子集检测”加固了合并逻辑。

下一步，建议进行一次回归测试：
1.  **手动测试**：打开游戏，产生一些消息，然后疯狂切换 Tab 或刷新 UI（触发 `extractHistoricalChatState`）。
2.  **观察**：确认控制台不再出现“检测到聊天记录不连续”的警告，且消息列表不再出现重复块。
3.  **清理测试**：如果仍有旧的重复数据，尝试使用“清理重复”按钮，确认它现在能正确消除重复项。

确认无误后，就可以考虑将版本号推进到 7.0.0 正式版了。

