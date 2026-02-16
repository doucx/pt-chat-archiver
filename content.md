## [WIP] refactor: 将序列修复逻辑下沉至 state.js 以修复测试

### 用户需求
修复 `tests/ordering.test.js` 失败的问题。

### 评论
之前的修复无效是因为逻辑被放在了 `main.js` 的 `scanAndMergeHistory` 中，而测试直接调用的是 `state.js` 的 `mergeAndDeduplicateMessages`。为了使逻辑可测试且高内聚，决定将 ID 序列修复逻辑下沉到核心状态管理模块 `state.js` 中。这样任何合并操作都会自动保证 ID 单调性。

### 目标
1.  在 `src/state.js` 中引入 `generateULID`。
2.  在 `mergeAndDeduplicateMessages` 返回合并结果前，执行序列修复算法：确保 `id` 随索引单调递增。
3.  清理 `src/main.js` 中之前添加的冗余修复逻辑。

### 基本原理
状态合并函数 (`merge`) 应当保证输出状态的完整性和一致性（包括排序一致性），而不仅仅是简单的数组拼接。

### 标签
#intent/refine #flow/ready #priority/high #comp/engine #concept/state #ai/instruct #task/domain/core #task/object/message-merging #task/action/refactor #task/state/end

---

### Script

#### Acts 1: 在 `src/state.js` 中实现序列修复逻辑

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
import { getISOTimestamp } from './utils.js';

/**
 * 生成用于比较的消息签名。
~~~~~
~~~~~javascript.new
import { generateULID, getISOTimestamp } from './utils.js';

/**
 * 生成用于比较的消息签名。
~~~~~

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
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
~~~~~

#### Acts 2: 清理 `src/main.js` 中冗余的修复逻辑

移除之前在 `scanAndMergeHistory` 中添加的代码，恢复原状（除了 `generateULID` 的 import，我们可以保留它，或者如果不使用了就移除。这里为了保险先保留 `import`，只移除逻辑）。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
      const oldMessages = serverData[channelName] || [];
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      // [核心修复] 序列 ID 修复 (Sequence Repair)
      // 解决 "Live(32s)" 与 "History(00s)" 合并后的排序倒错问题。
      // 如果发现后一条消息的 ID 小于前一条，强制重写后一条的 ID。
      let lastId = null;

      for (let i = 0; i < newMergedMessages.length; i++) {
        const msg = newMergedMessages[i];

        if (lastId && msg.id < lastId) {
          // 发现乱序：当前消息逻辑在后，但 ID 却更小
          // 以 LastMsg 的时间戳为基准，+1ms 作为新 ID 的种子
          // 注意：我们无法直接反解 ULID 的时间，但我们可以信任上一条消息的 time 属性作为参考
          // (如果上一条消息也是修复过的，它的 time 可能还没变，但 ID 变了。
          // 这里为了简单稳健，我们取 "上一条消息的时间戳" 和 "当前消息时间戳" 的最大值 + 1)

          const prevMsg = newMergedMessages[i - 1];
          const prevTime = new Date(prevMsg.time).getTime();
          const currTime = new Date(msg.time).getTime();

          // 确保新时间戳严格大于上一条的时间
          const newSeedTime = Math.max(prevTime, currTime) + 1;

          // 生成新 ID
          const newId = generateULID(newSeedTime);

          // 更新消息
          // 关键：我们只更新 ID 和 time (保持数据一致性)，不改变内容
          msg.id = newId;
          msg.time = new Date(newSeedTime).toISOString(); // 同步更新 time 以防后续逻辑困惑

          // console.log(`[Archiver] Fixed ordering for msg: ${msg.content.slice(0, 10)}...`);
        }
        lastId = msg.id;
      }

      if (newMergedMessages.length > oldMessages.length) {
        serverData[channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(oldMessages.length);
        for (const msg of newlyAddedHistoricalMessages) {
          addMessageToSyntheticChannelIfNeeded(serverData, msg, channelName);
        }
      }
~~~~~
~~~~~javascript.new
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
~~~~~

### 下一步建议
再次运行测试。现在逻辑已正确集成到 `mergeAndDeduplicateMessages` 中，测试应该能通过。
