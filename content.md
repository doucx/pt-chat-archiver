这是一个非常经典且严重的数据同步问题。经过详细分析，导致“随机的旧消息被插到最新处”的核心原因有两个互相作用的逻辑缺陷：

## [WIP] 对合并算法进行重构，并废除危险的全局 ID 重写机制

### 错误分析

1.  **贪婪对齐算法 (Greedy Alignment) 的断层误判**：
    在 `mergeAndDeduplicateMessages` 中，如果页面上获取的最新聊天记录（`newMessages`）与数据库中的历史记录（`oldMessages`）签名由于某些原因没能完全匹配（例如表情符号解析差异、刚进入时名字未加载导致的 Sender 差异），算法会尝试前后探查（Lookahead）。但之前的探查窗口只有 `k=5`。如果数据库因为之前记录了更多信息导致末尾比页面上的记录多了超过 5 条，探查就会失败。算法会将页面上的旧消息错误地判定为“数据库漏掉的新消息”。
2.  **暴力追加与级联 ID 重写 (Cascade ID Rewrite)**：
    更致命的是，一旦算法认为某条旧消息是“漏掉的”，它会直接将该消息**追加到数据库的最末尾**（`oldMessages.concat(messagesToAdd)`）。
    不仅如此，随后的 `ensureIdMonotonicity` 函数为了保证时间戳单调递增，会**重写该消息以及后续所有消息的 ID 和时间戳**。由于 IndexedDB 的 `put` 操作是基于 `id` 的，改变 ID 等同于新建了一条记录！这就导致了旧记录保留在原位，而末尾又出现了一批拥有新 ID 的“重复旧消息”。

### 解决方案

为了彻底根除此问题，我们需要对合并算法进行重构，并废除危险的全局 ID 重写机制：

1.  **精准的“拉链式”缝合 (Zipper Merge)**：不再把所有“漏掉”的消息无脑追加到末尾，而是精确记录它们在相对匹配中的位置，并在合并时**插入到正确的时间缝隙中**。
2.  **局部时间插值 (Local Time Interpolation)**：废除 `ensureIdMonotonicity`。对于需要插入的消息，我们读取其前一条基准消息的时间，仅给插入的新消息 +1 毫秒并生成新 ID。**绝对不修改数据库中已有消息的 ID**，从而避免 IndexedDB 产生重复残留。
3.  **扩大探查视野**：将容错探查窗口从 5 扩大到 50，以应对大幅度的刷新或历史消息积压。

以下是修复计划。

---

### Script

#### Acts 1: 重构状态合并核心算法

我们将完全重写 `src/state.js` 中的 `mergeAndDeduplicateMessages`，并移除不再需要的 `ensureIdMonotonicity` 函数。

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
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
~~~~~

### 下一步建议

这个修改彻底重构了合并策略，现在如果你因为网络波动等原因遗漏了一条历史消息，在再次触发抓取时，该消息将会**精确地安插在你遗漏的地方**，而不是被无脑怼到最新的对话底部。并且，它永远不会修改原有的 ID，这也直接免疫了 IndexedDB 复制黏贴自己导致数据体积膨胀的恶性 bug。

你可以重新加载并反复开关几次聊天框来验证一下行为。如果有重复消息产生，可以使用 UI 上的“扫描/清理重复”清理一波，以防原来的错误数据干扰你的体验。
