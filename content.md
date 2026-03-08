我们将通过引入 `uiState` 对频道选择状态的统一管理来消除 UI 控制权的“脏读”债务，并同步修复适配器接口调用不一致导致的崩溃 Bug。

## [WIP] refactor: 统一频道状态管理并修复数据恢复接口错误

### 用户需求
1.  **消除 UI 状态债务**：当前 `refreshView` 通过读取 DOM 属性来确定选中的频道，这种“脏读”破坏了数据驱动的原则。需要将 `selectedChannel` 纳入 `uiState` 统一管理。
2.  **修复运行时崩溃**：修复 `recoverLegacyData` 函数中因调用不存在的 `getRawState` 接口而导致的脚本崩溃问题。

### 评论
将 UI 状态完全外部化到 `uiState` 是实现“单向数据流”的关键步骤。这不仅能解决当前的逻辑不稳定性，也为将来引入更复杂的视图联动（如跨服务器搜索或全局统计）打下基础。同时，修复接口 Bug 是保证数据迁移功能可用的前提。

### 目标
1.  在 `ui/state.js` 中增加 `selectedChannel` 字段及相应的 setter。
2.  在 `ui/events.js` 中修改监听器，使其在切换频道时更新 `uiState`。
3.  重构 `ui/index.js` 的 `refreshView` 逻辑，使其从 `uiState` 读取频道信息并进行有效性校验。
4.  将 `ui/index.js` 中错误的 `getRawState()` 调用更正为 `getAllData()`。
5.  调整 `renderer.js`，使其完全依赖 `context` 传入的频道信息进行渲染，不再进行 DOM 读取。

### 基本原理
通过将 `selectedChannel` 提升至 `uiState`，控制器（`refreshView`）成为了真正的逻辑中心。它负责在渲染前对状态进行“对齐”（例如切换服务器后，旧的频道名在当前服务器可能不存在，控制器会自动修正它）。渲染器则退化为纯粹的展示层，仅负责将控制器确定的状态同步回 DOM。

### 标签
#intent/refine #intent/fix #flow/ready #priority/high #comp/cli #concept/state #scope/core #ai/delegate #task/domain/ui #task/object/state-management #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 扩展 `uiState` 以支持频道状态管理

在 `state.js` 中定义 `selectedChannel` 字段，并提供更新接口。

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isLockedToBottom: false, // 是否锁定在最底端跟随新消息
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
  };
~~~~~
~~~~~javascript.new
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isLockedToBottom: false, // 是否锁定在最底端跟随新消息
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
    selectedChannel: 'Local', // 默认为 Local 频道
  };
~~~~~
~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
    setViewingServer: (serverName) => {
      state.viewingServer = serverName;
    },
    getSelfName: async () => await storageManager.getSelfName(),
~~~~~
~~~~~javascript.new
    setViewingServer: (serverName) => {
      state.viewingServer = serverName;
    },
    setSelectedChannel: (channel) => {
      state.selectedChannel = channel;
    },
    getSelfName: async () => await storageManager.getSelfName(),
~~~~~

#### Acts 2: 更新事件绑定逻辑

确保用户在界面上操作频道选择器时，能够触发状态更新。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.channelSelector.addEventListener('change', () => {
    uiState.setPage(1);
    triggerRefresh();
  });
~~~~~
~~~~~javascript.new
  dom.channelSelector.addEventListener('change', () => {
    uiState.setSelectedChannel(dom.channelSelector.value);
    uiState.setPage(1);
    triggerRefresh();
  });
~~~~~

#### Acts 3: 重构核心控制器 `refreshView` 并修复接口 Bug

这是本次修改的核心。我们将修正数据恢复的函数名，并让 `refreshView` 成为频道选择的“真相来源”。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const refreshView = async () => {
    const { viewingServer, currentPage, pageSize, viewMode, isLockedToBottom } = uiState.getState();
    const serverList = await dataAdapter.getServers();

    // 确保 viewingServer 有效
~~~~~
~~~~~javascript.new
  const refreshView = async () => {
    const { viewingServer, currentPage, pageSize, viewMode, isLockedToBottom, selectedChannel: stateChannel } = uiState.getState();
    const serverList = await dataAdapter.getServers();

    // 确保 viewingServer 有效
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    // 确定当前选中的 Channel (Renderer 依赖 DOM，但我们可以先从 DOM 读一下之前的选择?)
    // 更好的方式是 UI State 也管理 selectedChannel，但目前在 DOM 里。
    // 我们先渲染一次 Server/Channel 列表，让 DOM 更新，然后读取值，再请求消息？
    // 或者一次性把上下文给 Renderer，让 Renderer 决定 Channel，然后 Renderer 再回调请求消息？
    // 不，这太复杂。
    // 简化方案：Controller 读取 DOM 状态 (Dirty read)
    let selectedChannel = dom.channelSelector.value;
    if (!selectedChannel && channelList.length > 0) selectedChannel = channelList[0];

    // 如果列表变了导致 selectedChannel 无效，修正它
    if (selectedChannel && !channelList.includes(selectedChannel)) selectedChannel = channelList[0];

    // 获取消息数据
~~~~~
~~~~~javascript.new
    // 确定当前选中的 Channel
    let selectedChannel = stateChannel;

    // 如果未选择或列表变动导致原选择失效，修正它并同步回 uiState
    if (!selectedChannel && channelList.length > 0) {
      selectedChannel = channelList[0];
      uiState.setSelectedChannel(selectedChannel);
    } else if (selectedChannel && !channelList.includes(selectedChannel)) {
      selectedChannel = channelList[0];
      uiState.setSelectedChannel(selectedChannel);
    }

    // 获取消息数据
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    const context = {
      serverList,
      channelList,
      channelCounts,
      messages,
      totalCount,
    };

    renderer.render(context, uiCallbacks);
~~~~~
~~~~~javascript.new
    const context = {
      serverList,
      channelList,
      channelCounts,
      messages,
      totalCount,
      selectedChannel, // 显式传递经过控制器校验的选中状态
    };

    renderer.render(context, uiCallbacks);
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const recoverLegacyData = async (targetServer) => {
    try {
      const rawState = await dataAdapter.getRawState();
      const newState = await MigrationManager.recoverAndMergeAll(rawState, targetServer);
~~~~~
~~~~~javascript.new
  const recoverLegacyData = async (targetServer) => {
    try {
      // 修正接口名：dataAdapter.getRawState -> dataAdapter.getAllData
      const rawState = await dataAdapter.getAllData();
      const newState = await MigrationManager.recoverAndMergeAll(rawState, targetServer);
~~~~~

#### Acts 4: 调整渲染器逻辑

移除渲染器中的“脏读”，使其直接应用 `context` 提供的频道状态。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
  const render = (context, callbacks) => {
    const { viewMode, currentPage, totalPages, viewingServer, activeServer, isLockedToBottom } =
      uiState.getState();
    const { serverList, channelList, channelCounts, messages } = context;

    // 1. 更新服务器选择器
~~~~~
~~~~~javascript.new
  const render = (context, callbacks) => {
    const { viewMode, currentPage, totalPages, viewingServer, activeServer, isLockedToBottom } =
      uiState.getState();
    const { serverList, channelList, channelCounts, messages, selectedChannel } = context;

    // 1. 更新服务器选择器
~~~~~
~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    // 3. 更新频道选择器
    const prevChannelValue = dom.channelSelector.value;
    dom.channelSelector.innerHTML = '';
    if (channelList.length === 0) {
      dom.channelSelector.innerHTML = '<option value="">无记录</option>';
    } else {
      for (const ch of channelList) {
        const opt = document.createElement('option');
        opt.value = ch;
        const count = channelCounts[ch] || 0;
        opt.textContent = `${ch} (${count})`;
        dom.channelSelector.appendChild(opt);
      }
      if (prevChannelValue && channelList.includes(prevChannelValue)) {
        dom.channelSelector.value = prevChannelValue;
      } else if (channelList.length > 0) {
        dom.channelSelector.value = channelList[0];
      }
    }
    const selectedChannel = dom.channelSelector.value;

    // Toggle view visibility
~~~~~
~~~~~javascript.new
    // 3. 更新频道选择器
    dom.channelSelector.innerHTML = '';
    if (channelList.length === 0) {
      dom.channelSelector.innerHTML = '<option value="">无记录</option>';
    } else {
      for (const ch of channelList) {
        const opt = document.createElement('option');
        opt.value = ch;
        const count = channelCounts[ch] || 0;
        opt.textContent = `${ch} (${count})`;
        dom.channelSelector.appendChild(opt);
      }
      // 直接应用 context 中计算好的选中频道
      if (selectedChannel) {
        dom.channelSelector.value = selectedChannel;
      }
    }

    // Toggle view visibility
~~~~~

### 下一步建议
- **持久化选中状态**：目前的 `selectedChannel` 仅存在于内存中。可以考虑将其存入 `STORE_CONFIG`，以便用户下次刷新页面时能自动回到上次查看的频道。
- **重构统计模式**：目前的统计模式依然会尝试拉取 999,999 条消息（内存炸弹）。建议下一步通过 IndexedDB 的 `count` 和多级游标扫描来实现分片统计，彻底解决内存瓶颈。
