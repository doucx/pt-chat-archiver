好的，我完全理解你的需求。在处理涉及大量 DOM 节点解析的历史记录扫描时（尤其是在手机或性能较弱的设备上），一个动态的 TUI 文本进度条（如 `[20/110]`）能够极大缓解用户的等待焦虑。

由于 IndexedDB 的读写事务在让出主线程（yield）时会自动关闭，且从数据库拉取 1000 条记录通常只需十几毫秒，因此真正的性能瓶颈和“感知卡顿”通常发生在我们初次**解析屏幕 DOM 上的历史聊天记录**时（`extractHistoricalChatState`）。

我将修改 `main.js` 中的解析函数，使其接受一个回调并在解析循环中按批次释放主线程以更新 UI 文本；同时在 `ui/index.js` 中暴露设置加载文本的接口。

## [WIP] feat: 在历史记录解析阶段引入纯文本 TUI 加载进度条

### 用户需求
对于加载历史记录时，需要显示一个“加载进度条”。比如 20/1000 ，纯文本 TUI 形式。

### 评论
这个改进非常巧妙。将同步的、CPU 密集型的 DOM 解析拆分为带有 `setTimeout(0)` 释放的小批次，并通过更新 textarea 的 `value` 实现进度条，既不增加额外的 UI 组件，又完美解决了初始化时浏览器潜在的冻结问题。

### 目标
1. 修改 `src/ui/index.js`，向外暴露 `setLoadingText(text)` 接口以允许外部脚本直接修改日志显示区的文本。
2. 修改 `src/main.js` 的 `extractHistoricalChatState` 函数，增加 `onProgress` 回调，并在倒序收集和正序解析的循环中，每 20 条记录汇报一次进度并让出主线程。
3. 修改 `src/main.js` 的 `performScanAndMerge`，将 `onProgress` 回调绑定到 `uiControls.setLoadingText`。

### 基本原理
通过在密集的 `for` 循环中加入 `if (i % 20 === 0)` 的判断，并在满足条件时 `await new Promise(r => setTimeout(r, 0))`，我们允许浏览器的渲染引擎有机会去更新 textarea 上的文本内容。这避免了 JS 长时间霸占主线程，从而实现了流畅的文本动画效果。

### 标签
#intent/tune #flow/ready #priority/medium #comp/core #comp/ui #scope/ux #task/domain/ux #task/object/loading-indicator #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 为 UI 控制器添加设置加载文本的接口

我们需要在 UI 控制器返回的对象中增加 `setLoadingText` 方法，允许 `main.js` 直接操控文本框显示进度。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        refreshView();
      }
    },
    setState: (newState) => {
      refreshView();
    },
    checkStorageUsage: async () => await renderer.checkStorageUsage(),
    isUIPaused: () => uiState.getState().isUIPaused,
    getInitDebounceMs: () => uiState.getState().initDebounceMs,
    updateRecordingStatus: (serverName, channelName) => {
      uiState.setRecordingStatus(serverName, channelName);
      refreshView();
    },
  };
~~~~~
~~~~~javascript.new
  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        refreshView();
      }
    },
    setState: (newState) => {
      refreshView();
    },
    setLoadingText: (text) => {
      if (dom.logDisplay) {
        dom.logDisplay.value = text;
      }
    },
    checkStorageUsage: async () => await renderer.checkStorageUsage(),
    isUIPaused: () => uiState.getState().isUIPaused,
    getInitDebounceMs: () => uiState.getState().initDebounceMs,
    updateRecordingStatus: (serverName, channelName) => {
      uiState.setRecordingStatus(serverName, channelName);
      refreshView();
    },
  };
~~~~~

#### Acts 2: 在历史解析核心逻辑中嵌入进度上报与协程释放

修改 `extractHistoricalChatState` 函数的签名，接受 `onProgress` 回调。并在两处高负载循环中引入进度计算和微任务释放。

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
~~~~~javascript.new
  /** 扫描聊天框中已存在的消息，时间戳根据UI显示的 `HH:MM` 进行估算。*/
  async function extractHistoricalChatState(onProgress) {
    const elements = locateChatElements();
    if (!elements.tabs || !elements.chatLog) return { current_tab: null, messages: [] };

    const current_tab = findActiveTabByClass(elements.tabs.innerHTML);
    const selfName = (await storageManager.getSelfName()) || '';
    const chatLines = Array.from(elements.chatLog.children);
    const total = chatLines.length;
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

      if (onProgress && (total - i) % 20 === 0) {
        onProgress(`⏳ 读取历史记录结构... [${total - i}/${total}]`);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // 2. 正序遍历：生成消息并确保批次内 ID 单调递增
    const messages = [];
    let lastCalculatedTimestamp = 0;
    const tempTotal = tempItems.length;

    for (let i = 0; i < tempTotal; i++) {
      const item = tempItems[i];
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

      if (onProgress && (i + 1) % 20 === 0) {
        onProgress(`⏳ 解析历史记录内容... [${i + 1}/${tempTotal}]`);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return { current_tab, messages };
  }
~~~~~

#### Acts 3: 将 UI 控制器绑定到扫描引擎的进度事件上

在 `performScanAndMerge` 中，利用新建的接口和回调完成连线。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  async function performScanAndMerge() {
    if (!detectedServerName) return;
    const historicalState = await extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
~~~~~
~~~~~javascript.new
  async function performScanAndMerge() {
    if (!detectedServerName) return;
    const historicalState = await extractHistoricalChatState((progressText) => {
      if (uiControls && !uiControls.isUIPaused()) {
        uiControls.setLoadingText(progressText);
      }
    });
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
~~~~~

### 下一步建议
我们已经实现了在 DOM 解析阶段的进度条。你可以构建并前往测试服或主站刷新网页进行验证。如果进度条闪烁过快说明你的设备性能极佳，这主要会在移动端或存在巨量 DOM 节点的私服上展现其真正的优势。
