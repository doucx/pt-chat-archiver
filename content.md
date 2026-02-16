## [WIP] fix: 实现 ID 序列修复与批次内单调性保证

### 用户需求
修复由于历史记录时间戳精度丢失（00秒）导致的消息排序错误问题。

### 评论
这是一个涉及数据完整性的核心修复。通过引入“序列修复”逻辑，我们确保了即使在时间源不可靠（精度倒退）的情况下，系统生成的 ULID 依然能反映真实的逻辑顺序（Logical Order），从而保证数据库查询结果的正确性。

### 目标
1.  修改 `extractHistoricalChatState`：在解析 DOM 生成消息时，强制保证同一批次内的消息 ID 时间戳单调递增。
2.  修改 `scanAndMergeHistory`：在合并消息后，执行一次序列检查。如果发现后一条消息的 ID 小于前一条，则基于前一条的时间推断并重生成后一条消息的 ID。

### 基本原理
利用 ULID 的词法排序特性。当物理时钟（文本时间）失效时，切换到逻辑时钟模式：`NewID = GenerateULID(Max(PhysicalTime, PreviousID_Time + 1ms))`。

### 标签
#intent/fix #flow/ready #priority/high #comp/runtime #concept/state #ai/instruct #task/domain/core #task/object/message-ordering #task/action/implementation #task/state/end

---

### Script

#### Acts 1: 重构 `extractHistoricalChatState` 实现批次内单调性

我们首先修改 `extractHistoricalChatState` 函数。我们需要改变循环逻辑，先收集所有数据，然后正序生成 ID，以确保单调性。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /** 扫描聊天框中已存在的消息，时间戳根据UI显示的 `HH:MM` 进行估算。*/
  async function extractHistoricalChatState() {
    const elements = locateChatElements();
    if (!elements.tabs || !elements.chatLog) return { current_tab: null, messages: [] };

    const current_tab = findActiveTabByClass(elements.tabs.innerHTML);
    const selfName = (await storageManager.getSelfName()) || '';
    const messages = [];
    const chatLines = Array.from(elements.chatLog.children);
    const currentDate = new Date();
    let lastTimeParts = null;

    for (let i = chatLines.length - 1; i >= 0; i--) {
      const element = chatLines[i];
      const timeNode = element.querySelector('.chat-line-timestamp');
      if (!timeNode || !timeNode.textContent.includes(':')) continue;

      const timeText = timeNode.textContent.trim();
      const [hours, minutes] = timeText.split(':').map(Number);
      if (
        lastTimeParts &&
        (hours > lastTimeParts.hours ||
          (hours === lastTimeParts.hours && minutes > lastTimeParts.minutes))
      ) {
        currentDate.setDate(currentDate.getDate() - 1);
      }
      lastTimeParts = { hours, minutes };

      const localDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')} ${timeText}`;
      const isoTimeApproximation = new Date(localDateString.replace(/-/g, '/')).toISOString();

      const messageData = extractUsefulData(element, selfName, isoTimeApproximation);
      if (messageData?.content) {
        messageData.is_historical = true;
        messages.push(messageData);
      }
    }
    messages.reverse();
    return { current_tab, messages };
  }
~~~~~
~~~~~javascript.new
  /** 扫描聊天框中已存在的消息，时间戳根据UI显示的 `HH:MM` 进行估算。*/
  async function extractHistoricalChatState() {
    const elements = locateChatElements();
    if (!elements.tabs || !elements.chatLog) return { current_tab: null, messages: [] };

    const current_tab = findActiveTabByClass(elements.tabs.innerHTML);
    const selfName = (await storageManager.getSelfName()) || '';
    const chatLines = Array.from(elements.chatLog.children);
    const currentDate = new Date();
    let lastTimeParts = null;

    // 1. 倒序遍历：确定每条消息的绝对时间（处理跨天逻辑）
    // 我们将结果存入临时数组，因为我们需要正序来生成单调递增的 ID
    const tempItems = [];

    for (let i = chatLines.length - 1; i >= 0; i--) {
      const element = chatLines[i];
      const timeNode = element.querySelector('.chat-line-timestamp');
      if (!timeNode || !timeNode.textContent.includes(':')) continue;

      const timeText = timeNode.textContent.trim();
      const [hours, minutes] = timeText.split(':').map(Number);
      if (
        lastTimeParts &&
        (hours > lastTimeParts.hours ||
          (hours === lastTimeParts.hours && minutes > lastTimeParts.minutes))
      ) {
        currentDate.setDate(currentDate.getDate() - 1);
      }
      lastTimeParts = { hours, minutes };

      const localDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')} ${timeText}`;
      const isoTimeApproximation = new Date(localDateString.replace(/-/g, '/')).toISOString();

      tempItems.unshift({ element, isoTime: isoTimeApproximation });
    }

    // 2. 正序遍历：生成消息并确保批次内 ID 单调递增
    const messages = [];
    let lastCalculatedTimestamp = 0;

    for (const item of tempItems) {
      let timestamp = new Date(item.isoTime).getTime();

      // [核心修复] 批次内单调性保证
      // 如果计算出的时间戳小于等于上一条，说明在一分钟内，强制微调 ID 时间戳
      if (timestamp <= lastCalculatedTimestamp) {
        timestamp = lastCalculatedTimestamp + 1;
      }
      lastCalculatedTimestamp = timestamp;

      // 使用微调后的时间戳生成数据（这将影响生成的 ID）
      const adjustedIsoTime = new Date(timestamp).toISOString();
      const messageData = extractUsefulData(item.element, selfName, adjustedIsoTime);

      if (messageData?.content) {
        messageData.is_historical = true;
        // 注意：messageData.time 现在包含了毫秒级微调。
        // 这对于排序是必要的，且不会影响 UI 显示（格式化函数会忽略毫秒）。
        messages.push(messageData);
      }
    }

    return { current_tab, messages };
  }
~~~~~

#### Acts 2: 增强 `scanAndMergeHistory` 实现序列修复

接下来修改 `scanAndMergeHistory`，在合并后加入序列修复逻辑。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
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
    }
    if (dataChanged && uiControls && !uiControls.isUIPaused()) {
~~~~~
~~~~~javascript.new
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
    }
    if (dataChanged && uiControls && !uiControls.isUIPaused()) {
~~~~~

#### Acts 3: 引入依赖

我们需要确保 `generateULID` 在 `main.js` 中可用。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
import { MigrationManager } from './migrations.js';
~~~~~
~~~~~javascript.new
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
import { MigrationManager } from './migrations.js';
import { generateULID } from './utils.js';
~~~~~

### 下一步建议
运行测试，确认修复有效。所有测试（包括新加的排序测试）应当全部通过。
