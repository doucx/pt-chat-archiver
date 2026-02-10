这是 v6 升级的最后一步，也是最关键的一步。

在这一阶段，我们将把前两个阶段准备好的“零件”（V6 存储驱动和 V6 状态机）组装起来。我们将实现核心的**数据迁移算法**，并改造 `main.js` 的生命周期，使其能够检测到旧数据并引导用户将其归并到正确的服务器下。同时，我们将更新所有的业务逻辑，确保消息被记录在“服务器 -> 频道”的正确层级中。

## [WIP] feat: 实施 v6 升级阶段三 - 迁移逻辑与主流程编排

### 用户需求
完成 v6 架构升级。实现从 v5 到 v6 的交互式数据迁移，并重构主录制逻辑以适配分层存储。

### 评论
这是整个升级的收官之战。通过引入交互式迁移，我们不仅确保了用户数据的绝对安全，还赋予了用户对数据归属的控制权。重构后的录制逻辑彻底解决了多服务器数据混淆的问题。

### 目标
1.  **实现迁移算法**: 在 `state.js` 中增加 `migrateV5toV6` 函数，支持数据合并。
2.  **重构存储调用**: 将 `state.js` 中的读写函数重定向到 V6 存储驱动。
3.  **改造主逻辑流程**:
    *   在 `main.js` 中实现服务器检测与迁移触发逻辑。
    *   适配 `handleNewChatMessage` 和 `scanAndMergeHistory` 以处理嵌套结构。
4.  **适配分析与清理**: 更新 `analysis.js` 和 `ui/index.js` 中的维护功能，使其遍历所有服务器的数据。

### 基本原理
我们采用“检测-确认-迁移”的异步工作流。当用户进入游戏并被检测到服务器名称时，程序会检查是否存在旧的扁平数据 (V5)。如果存在，通过 `confirm` 对话框请求授权，将旧数据作为该服务器的一个分支存入 V6 结构，并安全地移除 V5 键。

### 标签
#intent/build #flow/ready #priority/high #comp/engine #concept/state #concept/navigation #scope/core #scope/ux #ai/instruct #task/domain/architecture #task/object/v6-migration #task/action/orchestration #task/state/end

---

### Script

#### Acts 1: 实现迁移逻辑与适配存储函数

我们将 `state.js` 的读写逻辑切换到 V6，并添加核心迁移函数。

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
/** 从持久化层加载存档。*/
export function loadMessagesFromStorage() {
  return storage.getMessages();
}

/** 将内存中的存档保存到持久化层。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到本地存储');
  storage.saveMessages(messagesObject);
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
~~~~~
~~~~~javascript.new
/** 从持久化层加载存档 (V6)。*/
export function loadMessagesFromStorage() {
  return storage.getV6Messages();
}

/** 将内存中的存档保存到持久化层 (V6)。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到本地存储');
  storage.saveV6Messages(messagesObject);
}

/**
 * 将 V5 数据迁移到 V6 结构中的指定服务器。
 */
export function migrateV5toV6(v5Data, targetServer) {
  const v6Data = storage.getV6Messages();
  if (!v6Data[targetServer]) {
    v6Data[targetServer] = v5Data;
  } else {
    // 如果该服务器已有数据，进行频道级别的合并
    for (const channel in v5Data) {
      v6Data[targetServer][channel] = mergeAndDeduplicateMessages(
        v6Data[targetServer][channel] || [],
        v5Data[channel],
      );
    }
  }
  storage.saveV6Messages(v6Data);
  localStorage.removeItem('chatLogArchive_v5'); // 迁移成功后移除旧键
  return v6Data;
}

/**
 * 根据条件将消息添加到合成频道。
 * @param {object} channelMap - 目标服务器的频道映射对象。
 * @param {object} message - 消息数据对象。
 * @param {string} activeChannel - 消息产生时所在的活跃频道。
 */
export function addMessageToSyntheticChannelIfNeeded(channelMap, message, activeChannel) {
  if (activeChannel !== 'Local' || !channelMap) {
    return;
  }
~~~~~
~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
  if (syntheticChannelName) {
    if (!state[syntheticChannelName]) {
      state[syntheticChannelName] = [];
    }
    state[syntheticChannelName].push({ ...message });
    console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
  }
}
~~~~~
~~~~~javascript.new
  if (syntheticChannelName) {
    if (!channelMap[syntheticChannelName]) {
      channelMap[syntheticChannelName] = [];
    }
    channelMap[syntheticChannelName].push({ ...message });
    console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
  }
}
~~~~~

#### Acts 2: 适配分析引擎以支持分层结构

我们需要让重复检测功能能够遍历所有服务器。

~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript.old
/**
 * 检测所有频道中可被清理的重复记录总数。
 */
export function detectTotalDuplicates(messagesByChannel) {
  let totalDuplicates = 0;
  if (!messagesByChannel) return 0;
  for (const channel in messagesByChannel) {
    const records = messagesByChannel[channel];
~~~~~
~~~~~javascript.new
/**
 * 检测所有服务器及其频道中可被清理的重复记录总数。
 */
export function detectTotalDuplicates(messagesByServer) {
  let totalDuplicates = 0;
  if (!messagesByServer) return 0;
  for (const server in messagesByServer) {
    const channels = messagesByServer[server];
    if (!channels) continue;
    for (const channel in channels) {
      const records = channels[channel];
~~~~~

#### Acts 3: 改造主逻辑录制与迁移流

这是 `main.js` 的核心重构。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  function scanAndMergeHistory() {
    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      const oldMessages = inMemoryChatState[channelName] || [];
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      if (newMergedMessages.length > oldMessages.length) {
        inMemoryChatState[channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(oldMessages.length);
        for (const msg of newlyAddedHistoricalMessages) {
          addMessageToSyntheticChannelIfNeeded(inMemoryChatState, msg, channelName);
        }
      }
    }
~~~~~
~~~~~javascript.new
  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  function scanAndMergeHistory() {
    if (!detectedServerName) return;
    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      if (!inMemoryChatState[detectedServerName]) inMemoryChatState[detectedServerName] = {};

      const oldMessages = inMemoryChatState[detectedServerName][channelName] || [];
      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);

      if (newMergedMessages.length > oldMessages.length) {
        inMemoryChatState[detectedServerName][channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(oldMessages.length);
        for (const msg of newlyAddedHistoricalMessages) {
          addMessageToSyntheticChannelIfNeeded(
            inMemoryChatState[detectedServerName],
            msg,
            channelName,
          );
        }
      }
    }
~~~~~
~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /** 处理 MutationObserver 捕获到的新消息节点。*/
  function handleNewChatMessage(node) {
    if (isInitializingChat || isSwitchingTabs) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!currentActiveChannel) return;

    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      if (!inMemoryChatState[currentActiveChannel]) {
        inMemoryChatState[currentActiveChannel] = [];
      }
      inMemoryChatState[currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(inMemoryChatState, messageData, currentActiveChannel);

      if (uiControls && !uiControls.isUIPaused()) {
        uiControls.updateUI();
      }
    }
  }
~~~~~
~~~~~javascript.new
  /** 处理 MutationObserver 捕获到的新消息节点。*/
  function handleNewChatMessage(node) {
    if (isInitializingChat || isSwitchingTabs || !detectedServerName) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!currentActiveChannel) return;

    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      if (!inMemoryChatState[detectedServerName]) {
        inMemoryChatState[detectedServerName] = {};
      }
      if (!inMemoryChatState[detectedServerName][currentActiveChannel]) {
        inMemoryChatState[detectedServerName][currentActiveChannel] = [];
      }
      inMemoryChatState[detectedServerName][currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(
        inMemoryChatState[detectedServerName],
        messageData,
        currentActiveChannel,
      );

      if (uiControls && !uiControls.isUIPaused()) {
        uiControls.updateUI();
      }
    }
  }
~~~~~
~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import {
  addMessageToSyntheticChannelIfNeeded,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  saveMessagesToStorage,
} from './state.js';
~~~~~
~~~~~javascript.new
import {
  addMessageToSyntheticChannelIfNeeded,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  migrateV5toV6,
  saveMessagesToStorage,
} from './state.js';
import { storage } from './storage.js';
~~~~~
~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    // --- 启动服务器检测观察者 ---
    const updateServer = () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] 检测到服务器切换: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }
      }
    };
~~~~~
~~~~~javascript.new
    // --- 启动服务器检测观察者 ---
    const updateServer = () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] 检测到服务器切换: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }

        // --- 数据迁移检查 ---
        const v5Data = storage.getMessages();
        if (v5Data && Object.keys(v5Data).length > 0) {
          if (
            confirm(
              `【数据升级】检测到您的旧版本聊天存档。是否将其迁移到当前服务器 [${server}]？\n注意：如果不是该服务器，则选择取消，再选择目标服务器。`,
            )
          ) {
            const migrated = migrateV5toV6(v5Data, server);
            // 原子性地更新内存状态对象的内容
            for (const key of Object.keys(inMemoryChatState)) delete inMemoryChatState[key];
            Object.assign(inMemoryChatState, migrated);
            uiControls.updateUI();
          }
        }
      }
    };
~~~~~

#### Acts 4: 适配 UI 回调与全局操作

更新 `ui/index.js` 中的维护操作，使其能够处理所有服务器的数据。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const cleanChannelRecords = () => {
    const duplicateCount = appCallbacks.detectTotalDuplicates(appState);
    if (duplicateCount === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${duplicateCount} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const channel in appState) {
        const { cleanedRecords } = appCallbacks.cleanChannelRecords(appState[channel]);
        appState[channel] = cleanedRecords;
      }
      appCallbacks.saveMessagesToStorage(appState);
~~~~~
~~~~~javascript.new
  const cleanChannelRecords = () => {
    const duplicateCount = appCallbacks.detectTotalDuplicates(appState);
    if (duplicateCount === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${duplicateCount} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const server in appState) {
        const channels = appState[server];
        for (const channel in channels) {
          const { cleanedRecords } = appCallbacks.cleanChannelRecords(channels[channel]);
          channels[channel] = cleanedRecords;
        }
      }
      appCallbacks.saveMessagesToStorage(appState);
~~~~~

### 下一步建议

恭喜！v6 架构升级已经完成。现在系统能够自动感知服务器、隔离存储，并引导用户完成平滑的数据迁移。

**后续优化方向：**
1.  **迁移后验证**: 观察用户在完成 V5 到 V6 迁移后的反馈。如果迁移顺利，可以在下一版本彻底移除 `migrateDataV4toV5` 的遗留代码。
2.  **存储优化**: 随着多服务器数据的增加，localStorage 的 5MB 限制可能会成为瓶颈。可以考虑引入 IndexedDB 作为更强大的后端。
3.  **UI 精雕细琢**: 目前进入“只读模式”只是颜色和文本的变化，可以考虑在只读模式下禁用“清理重复”等可能引起误解的按钮。

你现在可以刷新页面进行实测了。
