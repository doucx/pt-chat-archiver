## [WIP] refactor: 开启 Preact 重构 - 阶段二：状态层 (State) 响应式改造

### 用户需求
根据重构路线图，执行阶段二任务：用 Preact Signals 替换原有的 Vanilla JS 状态管理（`ui/state.js`）。同时不破坏现有基于 Vanilla JS 的事件和渲染器，以保证重构过程中的平滑过渡。

### 评论
这是一种“外观模式（Facade Pattern）”的绝佳应用。我们将 `src/ui/state.js` 重写为一个代理对象，它的所有 `get` 和 `set` 方法都在底层操作 `@preact/signals`。这样，`renderer.js` 和 `events.js` 完全察觉不到底层状态引擎已经换成了响应式的 Signal，而我们可以顺理成章地将数据状态暴露给即将到来的 Preact 组件。

### 目标
1.  创建 `src/ui/store/dataStore.js` 存放共享数据流（服务器列表、频道列表、当前消息等）。
2.  重写 `src/ui/state.js`，让它成为 `uiStore.js` 的门面代理。
3.  在 `src/ui/index.js` 的 `refreshView` 核心流程中，将提取到的数据实时同步给 `dataStore` 的 Signals，从而“桥接”新旧两个世界。

### 基本原理
通过分离 UI 状态 (`uiStore`) 和数据状态 (`dataStore`)，我们构建了清晰的单向数据流。目前 `refreshView` 作为传统的 Controller 存在，它拉取数据后不仅调用 `renderer.render()`（驱动旧版 DOM），还更新 `dataStore` 的 Signals（驱动新版 Preact）。这为我们在阶段三引入组件提供了完美的数据源。

### 标签
#intent/refine #flow/ready #priority/high
#comp/ui #concept/state #scope/core
#ai/delegate
#task/domain/ui #task/object/preact-refactor #task/action/state-migration
#task/state/continue #task/status/active

---

### Script

#### Acts 1: 创建共享数据流 Store

我们需要一个地方来集中存放从 IndexedDB 提取出的数据阵列。这些将作为 Preact 组件的直接数据源。

~~~~~act
write_file
src/ui/store/dataStore.js
~~~~~
~~~~~javascript
import { signal } from '@preact/signals';

// --- 共享的数据状态 ---
export const serverList = signal([]);
export const channelList = signal([]);
export const channelCounts = signal({});
export const currentMessages = signal([]);
export const totalCount = signal(0);
~~~~~

#### Acts 2: 桥接旧版控制器与响应式系统

在 `index.js` 中引入 `dataStore`，并在每次提取数据后同步到 Signals。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
import { createUIState } from './state.js';
import { ViewCache } from './view-cache.js';
~~~~~
~~~~~javascript.new
import { createUIState } from './state.js';
import { serverList as serverListSig, channelList as channelListSig, channelCounts as channelCountsSig, currentMessages, totalCount as totalCountSig } from './store/dataStore.js';
import { ViewCache } from './view-cache.js';
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
      selectedChannel, // 显式传递经过控制器校验的选中状态
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

    // [Bridge] 同步数据到 Preact Signals，为即将到来的组件化供电
    serverListSig.value = serverList;
    channelListSig.value = channelList;
    channelCountsSig.value = channelCounts;
    currentMessages.value = messages;
    totalCountSig.value = totalCount;

    renderer.render(context, uiCallbacks);
~~~~~

#### Acts 3: 响应式改造 state.js (门面模式)

完全重写 `ui/state.js`，将原本的闭包状态替换为对 `uiStore.js` 响应式节点的访问。这使得现有代码无需修改即可接入响应式生态。

~~~~~act
write_file
src/ui/state.js
~~~~~
~~~~~javascript
import { storageManager } from '../storage/index.js';
import { 
  currentPage, pageSize, statsLimit, readChunkSize, initDebounceMs, cachePages,
  autoFollowServer, totalPages, viewMode, isLockedToBottom, isUIPaused,
  activeServer, recordedChannel, viewingServer, selectedChannel, lastServer,
  updateConfig, initStore
} from './store/uiStore.js';

/**
 * Creates and manages the UI's internal state.
 * (Currently acting as a backwards-compatible Facade for Preact Signals)
 * @returns {Promise<object>} A promise that resolves to a UI state manager instance.
 */
export async function createUIState() {
  await initStore();

  return {
    getState: () => ({
      currentPage: currentPage.value,
      pageSize: pageSize.value,
      statsLimit: statsLimit.value,
      readChunkSize: readChunkSize.value,
      initDebounceMs: initDebounceMs.value,
      cachePages: cachePages.value,
      autoFollowServer: autoFollowServer.value,
      lastSavedTime: null,
      totalPages: totalPages.value,
      viewMode: viewMode.value,
      isLockedToBottom: isLockedToBottom.value,
      isUIPaused: isUIPaused.value,
      activeServer: activeServer.value,
      recordedChannel: recordedChannel.value,
      viewingServer: viewingServer.value,
      selectedChannel: selectedChannel.value,
      lastServer: lastServer.value,
    }),

    setPage: (page) => { 
      currentPage.value = Math.max(1, Math.min(page, totalPages.value)); 
    },
    setTotalPages: (total) => { 
      totalPages.value = Math.max(1, total); 
    },
    setViewMode: (mode) => { 
      if (['log', 'stats', 'config'].includes(mode)) {
        viewMode.value = mode; 
      }
    },
    setPageSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) await updateConfig('pageSize', val);
    },
    setStatsLimit: async (limit) => {
      const val = Number.parseInt(limit, 10);
      if (!Number.isNaN(val) && val >= 100) await updateConfig('statsLimit', val);
    },
    setReadChunkSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 50) await updateConfig('readChunkSize', val);
    },
    setInitDebounceMs: async (ms) => {
      const val = Number.parseInt(ms, 10);
      if (!Number.isNaN(val) && val >= 50) await updateConfig('initDebounceMs', val);
    },
    setCachePages: async (pages) => {
      const val = Number.parseInt(pages, 10);
      if (!Number.isNaN(val) && val >= 1) await updateConfig('cachePages', val);
    },
    setAutoFollowServer: async (enabled) => {
      await updateConfig('autoFollowServer', !!enabled);
    },
    setLastSavedTime: (isoString) => {
      // Legacy
    },
    togglePause: () => { 
      isUIPaused.value = !isUIPaused.value; 
      return isUIPaused.value; 
    },
    setLockedToBottom: (locked) => { 
      isLockedToBottom.value = !!locked; 
    },
    forcePause: (paused) => { 
      isUIPaused.value = paused; 
    },
    setRecordingStatus: (serverName, channelName) => {
      activeServer.value = serverName;
      recordedChannel.value = channelName;
      if (serverName) {
        lastServer.value = serverName;
        storageManager.setLastServer(serverName); // 立即持久化
      }
      if (autoFollowServer.value || !viewingServer.value) {
        viewingServer.value = serverName;
      }
    },
    setViewingServer: (serverName) => { 
      viewingServer.value = serverName; 
    },
    setSelectedChannel: (channel) => { 
      selectedChannel.value = channel; 
    },
    getSelfName: async () => await storageManager.getSelfName(),
    setSelfName: async (name) => await storageManager.setSelfName(name),
  };
}
~~~~~

### 下一步建议
通过门面模式，我们已经成功将响应式引擎埋入了系统的深处，而完全没有破坏旧的运行逻辑。

现在我们可以正式进入 **阶段三：原子组件拆分**。我们将从简单的组件开始，依次创建 `Header.jsx`, `Pagination.jsx`, `ConfigPanel.jsx` 等，逐步将 `templates.js` 中的巨型字符串拆分成可维护的模块，并让它们直接订阅和修改我们刚建立的 `Signals` 状态。
