好的，我们现在开始执行 **阶段三：迁移逻辑与主流程编排**。

这是 v6 升级计划中最核心的一步。我们将实现数据的物理隔离，并为用户提供从旧版扁平结构到新版服务器嵌套结构的迁移路径。同时，通过引入 `setState` 接口，我们将彻底解决 UI 模块与主逻辑模块之间的状态同步难题。

我将生成一个计划来实现这些改动。

## [WIP] feat: implement V5 to V6 data migration and server-aware recording

### 用户需求
实施 v6 架构升级的阶段三，主要包括：
1. 实现从 V5（扁平结构）到 V6（按服务器嵌套结构）的数据迁移算法。
2. 升级主循环逻辑，根据检测到的服务器名称进行数据隔离录制。
3. 建立 UI 与主逻辑间的 `setState` 通讯桥梁，确保状态同步。

### 评论
这是 v6 升级中最关键的一步。它实现了数据的“物理隔离”，解决了多服务器数据混淆的痛点。通过引入显式的迁移提示，我们确保了用户对自己数据的控制权，符合安全第一的原则。

### 目标
1. 在 `storage.js` 中完善 V6 存储和 V5 清理接口。
2. 在 `state.js` 中实现 `migrateV5toV6` 算法，并适配 V6 结构更新相关功能。
3. 在 `ui/index.js` 中暴露 `setState` 接口。
4. 在 `main.js` 中编排服务器检测、迁移弹窗和隔离录制流程。

### 基本原理
1. **数据分层**: 存储结构从 `Channel -> Messages` 升级为 `Server -> Channel -> Messages`。
2. **迁移触发器**: 利用 `MutationObserver` 监控服务器切换，一旦发现当前服务器有效且存在旧版 V5 数据，则提示用户迁移。
3. **单向同步**: UI 模块通过闭包维持对 `appState` 的引用。当主逻辑中的状态对象被替换（如迁移后），必须通过 `setState` 显式更新 UI 的引用，防止渲染过期数据。

### 标签
#intent/build #flow/ready #priority/high #comp/engine #comp/interfaces #concept/state #concept/navigation #scope/core #ai/instruct #task/domain/storage #task/object/v6-migration #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 完善存储驱动接口

在 `storage.js` 中添加删除 V5 数据的接口。

~~~~~act
patch_file
src/storage.js
~~~~~
~~~~~javascript.old
  saveMessages(messagesObject) {
    try {
      localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(messagesObject));
    } catch (e) {
      console.error('[Storage] 保存 V5 存档失败:', e);
    }
  },

  clearAllMessages() {
~~~~~
~~~~~javascript.new
  saveMessages(messagesObject) {
    try {
      localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(messagesObject));
    } catch (e) {
      console.error('[Storage] 保存 V5 存档失败:', e);
    }
  },

  removeV5Data() {
    localStorage.removeItem(STORAGE_KEY_V5);
  },

  clearAllMessages() {
~~~~~

#### Acts 2: 实现迁移算法与适配 V6 逻辑

在 `state.js` 中实现 V5 到 V6 的迁移，并更新加载/保存函数。同时调整 `addMessageToSyntheticChannelIfNeeded` 的参数以适配。

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
  let syntheticChannelName = null;
  if (message.type.includes('party')) {
    syntheticChannelName = 'Party-Local';
  } else if (message.type.includes('whisper')) {
    syntheticChannelName = 'Whisper-Local';
  }
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
/** 从持久化层加载存档 (V6)。*/
export function loadMessagesFromStorage() {
  return storage.getV6Messages();
}

/** 将内存中的存档保存到持久化层 (V6)。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到本地存储 (V6)');
  storage.saveV6Messages(messagesObject);
}

/**
 * 执行 V5 到 V6 的数据迁移。
 */
export function migrateV5toV6(v5Data, targetServer) {
  console.log(`[Migration] 正在将 V5 数据迁移到服务器: ${targetServer}`);
  const v6Data = storage.getV6Messages();

  if (!v6Data[targetServer]) {
    v6Data[targetServer] = v5Data;
  } else {
    // 如果目标服务器已存在数据，执行频道级合并
    for (const channel in v5Data) {
      v6Data[targetServer][channel] = mergeAndDeduplicateMessages(
        v6Data[targetServer][channel] || [],
        v5Data[channel],
      );
    }
  }

  storage.saveV6Messages(v6Data);
  storage.removeV5Data();
  console.log('[Migration] V5 迁移完成，旧数据已移除。');
  return v6Data;
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
    console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
  }
}
~~~~~

#### Acts 3: 建立 UI 状态更新桥梁

修改 `ui/index.js`，使 `appState` 可变，并暴露 `setState` 接口。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
export function createUI(initialAppState, appCallbacks) {
  const appState = initialAppState;

  // 1. Initialize DOM structure
~~~~~
~~~~~javascript.new
export function createUI(initialAppState, appCallbacks) {
  let appState = initialAppState;

  // 1. Initialize DOM structure
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        renderer.render(appState, uiCallbacks);
      }
    },
    checkStorageUsage: renderer.checkStorageUsage,
~~~~~
~~~~~javascript.new
  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        renderer.render(appState, uiCallbacks);
      }
    },
    setState: (newState) => {
      appState = newState;
      renderer.render(appState, uiCallbacks);
    },
    checkStorageUsage: renderer.checkStorageUsage,
~~~~~

#### Acts 4: 改造 `main.js` 驱动流程

重构 `handleNewChatMessage`、`scanAndMergeHistory` 以支持隔离录制，并实装迁移触发逻辑。

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
    if (dataChanged && uiControls && !uiControls.isUIPaused()) {
      uiControls.updateUI();
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
      const serverData = inMemoryChatState[detectedServerName];

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
      uiControls.updateUI();
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
      if (!inMemoryChatState[detectedServerName]) inMemoryChatState[detectedServerName] = {};
      const serverData = inMemoryChatState[detectedServerName];

      if (!serverData[currentActiveChannel]) {
        serverData[currentActiveChannel] = [];
      }
      serverData[currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(serverData, messageData, currentActiveChannel);

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

        // 检查 V5 数据迁移逻辑
        const v5Data = storage.getMessages(); // storage.getMessages 获取的是 V5
        if (v5Data && Object.keys(v5Data).length > 0) {
          const msg = `【数据升级】检测到您的旧版本聊天存档。是否将其迁移到当前服务器 [${server}]？\n\n注意：如果不是该服务器，则选择取消，再选择目标服务器后迁移提示将再次弹出。`;
          if (confirm(msg)) {
            inMemoryChatState = migrateV5toV6(v5Data, server);
            uiControls.setState(inMemoryChatState);
          }
        }
      }
    };
~~~~~

### 下一步建议
目前 Phase 3 已完成核心逻辑的部署。下一步建议：
1. **全面验证**: 测试不同服务器间的切换是否能正确触发表单，并检查迁移后的数据在 UI 中是否能按服务器分类显示。
2. **导出逻辑适配**: 检查 `ui/index.js` 中的 `downloadAllData` 和 `copyAllData` 是否能处理 V6 的嵌套结构，必要时进行重构以支持导出所有服务器或当前查看的服务器。
3. **清理旧代码**: 在确认 V6 稳定运行后，可以安全移除 `migrateDataV4toV5` 相关逻辑。
