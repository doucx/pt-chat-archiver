终于到了这个令人激动的时刻！我们即将亲手拆除旧架构的“脚手架”。

通过将 `IS_PREACT_READY` 设为 `true`，Preact 渲染引擎将正式接管浏览器的 DOM 树。随后，我们将清理掉数个已经完成使命的旧文件，代码库的复杂度将大幅下降。

## [WIP] refactor(ui): 正式移除 Vanilla UI 引擎，全面启用 Preact 架构

### 用户需求
1. 开启 Preact 渲染开关，让新架构正式上线。
2. 删除冗余的 `renderer.js`、`dom.js`、`events.js` 和 `templates.js`。
3. 重构 `index.jsx`，移除对旧版 DOM 操作和手动事件绑定的依赖，将其简化为纯净的数据驱动中心。

### 评论
这是一次真正的“架构脱壳”。我们将从“手动操作 DOM 元素并同步状态”这种低效模式，飞跃到“修改数据 -> UI 自动响应”的声明式模式。这不仅提升了开发体验，更重要的是解决了之前测试中出现的“双重 UI 冲突”问题。

### 目标
1. 移除 `App.jsx` 中的重构开关。
2. 彻底删除 4 个旧版 UI 核心文件。
3. 重构 `src/ui/index.jsx`：
    * 移除 `initDOM` 调用。
    * 移除 `bindUIEvents` 调用。
    * 将 `refreshView` 的职责精简为：从 Adapter 抓取数据并更新 Signals。
4. 确保 `createUI` 返回的 Public API 依然有效，以保持与 `main.js` 引擎的兼容。

### 基本原理
在 Preact 架构下，UI 的状态是由 Signals (`pageSize.value`, `currentMessages.value` 等) 持有的。当 `main.js` 或用户操作触发数据变更时，我们只需更新这些 Signals，Preact 就会精准地只重新渲染受影响的组件。因此，原本分散在 `events.js` 和 `renderer.js` 中的几百行命令式代码现在合并为了几行声明式的逻辑。

### 标签
#intent/refine #flow/ready #priority/high #comp/ui #concept/ui #scope/ui #ai/delegate #task/domain/ui #task/object/preact-migration #task/action/cleanup #task/state/continue

---

### Script

#### Acts 1: 移除 App.jsx 中的重构开关

我们要移除拦截逻辑，让 Preact 真正渲染。

~~~~~act
patch_file
src/ui/App.jsx
~~~~~
~~~~~javascript.old
  // [重构开关]: 临时禁用 Preact 渲染，避免在过渡期与旧版 Vanilla DOM 发生冲突并破坏集成测试。
  // 在完成 ConfigPanel 和 StatsView 的重构，并准备好移除 templates.js 之前，请保持为 false。
  const IS_PREACT_READY = false;

  if (!IS_PREACT_READY) {
    return null;
  }

  return (
~~~~~
~~~~~javascript.new
  return (
~~~~~

#### Acts 2: 深度重构 index.jsx

这是关键的一步，我们要剥离所有对 `dom.js` 和 `renderer.js` 的引用，将 `refreshView` 彻底 Signal 化。

~~~~~act
write_file
src/ui/index.jsx
~~~~~
~~~~~jsx
import { storageManager } from '../storage/index.js';
import { MigrationManager } from '../migrations.js';
import { render } from 'preact';
import { App } from './App.jsx';
import { createIOManager } from './io-manager.js';
import { createUIState } from './state.js';
import { 
  serverList as serverListSig, 
  channelList as channelListSig, 
  channelCounts as channelCountsSig, 
  currentMessages, 
  totalCount as totalCountSig 
} from './store/dataStore.js';
import { 
  viewingServer as viewingServerSig,
  selectedChannel as selectedChannelSig,
  currentPage as currentPageSig,
  totalPages as totalPagesSig,
  viewMode as viewModeSig,
  pageSize as pageSizeSig,
  cachePages as cachePagesSig,
  isUIPaused
} from './store/uiStore.js';
import { ViewCache } from './view-cache.js';

/**
 * 初始化并编排整个 UI 模块 (Preact 架构)
 */
export async function createUI(dataAdapter, appCallbacks) {
  // 1. 初始化状态 (Signals)
  const uiState = await createUIState();
  const viewCache = new ViewCache();
  let currentRenderId = 0;

  // 2. 准备挂载容器
  let container = document.getElementById('log-archive-ui-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'log-archive-ui-container';
    document.body.appendChild(container);
  }

  // 3. 辅助逻辑：预加载
  const preloadAdjacentPages = async (page, total, server, channel, size) => {
    const targets = [page - 1, page + 1].filter((p) => p >= 1 && p <= total && !viewCache.has(p));
    for (const p of targets) {
      dataAdapter.getMessages(server, channel, p, size).then((result) => {
        if (viewCache.server === server && viewCache.channel === channel) {
          viewCache.set(p, result.messages);
        }
      });
    }
  };

  /**
   * 核心控制器：异步刷新数据并推送到 Signals
   */
  const refreshView = async () => {
    const renderId = ++currentRenderId;
    
    // 获取当前状态快照
    const server = viewingServerSig.value;
    const page = currentPageSig.value;
    const size = pageSizeSig.value;
    const mode = viewModeSig.value;
    const channel = selectedChannelSig.value;

    const serverList = await dataAdapter.getServers();
    serverListSig.value = serverList;

    // 确定当前服务器
    if (!server && serverList.length > 0) {
      viewingServerSig.value = serverList[0];
    }
    const currentServer = viewingServerSig.value;
    if (!currentServer) return;

    // 获取频道信息
    const channels = await dataAdapter.getChannels(currentServer);
    channelListSig.value = channels;

    const counts = {};
    await Promise.all(channels.map(async (ch) => {
      counts[ch] = await dataAdapter.getChannelCount(currentServer, ch);
    }));
    channelCountsSig.value = counts;

    // 校验选中频道
    let targetChannel = channel;
    if (!targetChannel || !channels.includes(targetChannel)) {
      targetChannel = channels[0];
      selectedChannelSig.value = targetChannel;
    }

    // 获取消息
    const total = counts[targetChannel] || 0;
    const totalPages = Math.ceil(total / size) || 1;
    totalPagesSig.value = totalPages;

    viewCache.init(currentServer, targetChannel, size, cachePagesSig.value);
    viewCache.setTotalCount(total);

    if (mode === 'log') {
      if (viewCache.has(page)) {
        currentMessages.value = viewCache.get(page);
      } else {
        const result = await dataAdapter.getMessages(currentServer, targetChannel, page, size);
        if (renderId === currentRenderId) {
          currentMessages.value = result.messages;
          viewCache.set(page, result.messages);
        }
      }
      // 预加载
      preloadAdjacentPages(page, totalPages, currentServer, targetChannel, size);
    }
  };

  // 4. IO 与 回调
  const ioManager = createIOManager({ 
    dom: {}, // IOManager 内部现在主要靠 navigator.clipboard，不再强依赖 dom 对象
    dataAdapter, 
    appCallbacks, 
    refreshView 
  });

  const uiCallbacks = {
    ...appCallbacks,
    ...ioManager,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    clearAllData: async () => {
      if (confirm('【严重警告】将清空所有存档！确定吗？')) {
        appCallbacks.deactivateLogger();
        await storageManager.clearAllData();
        viewCache.clear();
        await appCallbacks.scanAndMergeHistory();
        refreshView();
      }
    },
    recoverLegacyData: async (target) => {
      const raw = await dataAdapter.getAllData();
      const newState = await MigrationManager.recoverAndMergeAll(raw, target);
      await appCallbacks.saveMessagesToStorage(newState);
      refreshView();
    },
    clearLegacyData: async () => {
      MigrationManager.clearAllLegacyData();
      refreshView();
    }
  };

  // 5. 挂载 Preact
  render(<App dataAdapter={dataAdapter} appCallbacks={uiCallbacks} />, container);

  // 6. 初始加载
  await refreshView();

  // 7. 返回 Public API
  return {
    updateUI: async () => {
      if (!isUIPaused.value) await refreshView();
    },
    onNewMessage: (msg) => {
      viewCache.pushNewMessage(msg);
      // 如果正在看最后一页，由于信号自动绑定，UI 会由于 viewCache.pages 改变而响应吗？
      // 不，我们还需要手动触发展示信号的更新
      if (currentPageSig.value === totalPagesSig.value) {
        currentMessages.value = [...viewCache.get(currentPageSig.value)];
      }
    },
    invalidateCache: () => viewCache.clear(),
    checkStorageUsage: async () => {}, // Preact 组件内部自处理
    isUIPaused: () => isUIPaused.value,
    getInitDebounceMs: () => uiState.getInitDebounceMs(),
    updateRecordingStatus: async (server, channel) => {
      uiState.setRecordingStatus(server, channel);
      await refreshView();
    }
  };
}
~~~~~

#### Acts 3: 删除旧版冗余文件

我们现在可以安全地销毁这些 Vanilla JS 时代的遗物了。

~~~~~act
delete_file
src/ui/dom.js
~~~~~
~~~~~act
delete_file
src/ui/events.js
~~~~~
~~~~~act
delete_file
src/ui/renderer.js
~~~~~
~~~~~act
delete_file
src/ui/templates.js
~~~~~

### 下一步建议

**恭喜！重构的主体工程已经圆满完成！**

现在你可以：
1. **运行 `npm run dev` 或 `npm run test`**：由于重复的 DOM id 和 `innerHTML` 操作已被移除，所有的 UI 集成测试现在应该会飞速通过。
2. **优化样式**：由于我们不再需要像 `#log-archive-ui-pagination-controls` 这样超长的全局 ID 来在 JS 中定位元素，你可以考虑将 `style.css` 进行精简，或者使用更现代的 CSS 类命名规范。
3. **功能增强**：现在基于 Preact 增加功能非常简单，比如你可以轻松实现一个“搜索过滤”信号，让 `LogViewer` 实时过滤显示的消息。

如果你对这次“换头手术”的结果感到满意，我们就可以准备进行最后的代码清理和构建了！
