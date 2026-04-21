在阶段一完成了“地基”搭建后，我们现在进入 **阶段二：状态层 (State) 响应式改造**。

这一阶段的任务是核心：我们将把 UI 的入口点从传统的命令式逻辑转向 Preact 的声明式驱动。通过将 `uiStore.js` 中的 Signals 注入到 `createUI` 的主循环中，我们将实现“状态改变 -> UI 自动更新”的初步闭环，并开始逐步边缘化旧的 `renderer.js`。

## [WIP] feat: 状态层响应式改造与 Preact 引擎挂载

### 用户需求
将 Preact 引擎正式挂载到应用中，并将原本在 `index.js` 中的异步刷新逻辑（`refreshView`）与基于 Signals 的响应式状态存储（`uiStore`）进行对接。

### 评论
这是一次“平滑过渡”的关键步骤。我们不打算一次性删除所有旧代码，而是让 Preact 容器与现有的 DOM 结构共存并逐步接管。通过 Signals 代理原有的 `updateUI` 调用，可以确保后端逻辑（如 `main.js`）无需大幅改动即可享受响应式带来的好处。

### 目标
1.  修改 `src/ui/index.js`：引入 Preact `render` 函数，初始化 `uiStore`，并将 `App` 组件挂载到容器。
2.  重构 `refreshView` 逻辑：使其能够根据 Signal 的变化做出反应。
3.  更新 `App.jsx`：使其成为一个真正的状态分发中心，能够接收并观察 Signals。
4.  建立桥接机制：让 `main.js` 调用的 `updateUI` 方法直接触发 Signals 更新。

### 基本原理
我们利用 Preact 的 `render` 将虚拟 DOM 树转化为真实的 DOM 并挂载。通过在 `index.js` 中初始化 `uiStore`，我们建立了一个全局单一事实来源。原本分散在各处的 `uiState.setXxx` 将被替换为对 Signals 的赋值，从而触发 Preact 内部的微任务调度进行局部重绘，替代原本重型的全量 `innerHTML` 更新。

### 标签
#intent/refine #flow/ready #priority/high 
#comp/ui #concept/state #concept/navigation #scope/core 
#ai/delegate
#task/domain/ui #task/object/preact-refactor #task/action/state-integration 
#task/state/continue #task/status/active

---

### Script

#### Acts 1: 重构 UI 模块入口 (index.js)

我们将重写 `createUI` 函数，使其成为 Preact 的挂载点，并桥接 Signals 状态。

~~~~~act
write_file
src/ui/index.js
~~~~~
~~~~~javascript
import { render } from 'preact';
import { App } from './App.jsx';
import { 
  initStore, 
  viewMode, 
  isUIPaused, 
  viewingServer, 
  activeServer, 
  recordedChannel,
  lastServer,
  initDebounceMs
} from './store/uiStore.js';
import { storageManager } from '../storage/index.js';
import { ViewCache } from './view-cache.js';
import { createIOManager } from './io-manager.js';

/**
 * 现代化的 UI 模块初始化入口
 */
export async function createUI(dataAdapter, appCallbacks) {
  // 1. 初始化响应式存储 (从持久化层加载配置)
  await initStore();

  // 2. 创建 UI 容器
  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
  document.body.appendChild(container);

  // 3. 挂载 Preact 应用
  // 我们将 dataAdapter 和 appCallbacks 作为 Props 注入
  render(
    <App dataAdapter={dataAdapter} appCallbacks={appCallbacks} />, 
    container
  );

  // 4. 初始化视图缓存 (非 UI 逻辑保持现状)
  const viewCache = new ViewCache();

  // --- 桥接逻辑: 暴露给 main.js 的公共 API ---
  return {
    /**
     * 外部触发的 UI 刷新指令 (如 main.js 检测到心跳)
     */
    updateUI: () => {
      // 在 Preact 架构下，大部分刷新是自动的。
      // 此处主要用于触发那些未与 Signal 直接绑定的副作用逻辑。
    },

    /**
     * 当有新消息产生时，更新缓存并可能触发自动滚动
     */
    onNewMessage: (msg) => {
      viewCache.pushNewMessage(msg);
      // 如果处于 RECORDING 状态且没有暂停，Signal 的变化会驱动组件重绘
    },

    invalidateCache: () => {
      viewCache.clear();
    },

    /**
     * 设置服务器记录状态 (核心桥接)
     */
    updateRecordingStatus: (serverName, channelName) => {
      activeServer.value = serverName;
      recordedChannel.value = channelName;
      if (serverName) lastServer.value = serverName;

      // 逻辑迁移: 自动跟随服务器切换查看视图
      const config = storageManager.getConfig(); // 这里暂用同步读取或 Signal 值
      if (!viewingServer.value || (serverName && !isUIPaused.value)) {
         viewingServer.value = serverName;
      }
    },

    isUIPaused: () => isUIPaused.value,
    getInitDebounceMs: () => initDebounceMs.value,
    
    // 临时桥接：直到 renderer.js 被完全移除
    checkStorageUsage: async () => {
       const usage = await storageManager.getRawSize();
       return usage;
    }
  };
}
~~~~~

#### Acts 2: 增强 App.jsx 的架构能力

将 `App.jsx` 改造为真正的组件分发中心，它将通过订阅 Signals 来决定渲染哪个视图。

~~~~~act
write_file
src/ui/App.jsx
~~~~~
~~~~~jsx
import { useEffect, useState } from 'preact/hooks';
import { 
  viewMode, 
  isUIPaused, 
  viewingServer, 
  activeServer, 
  recordedChannel,
  isReadOnly 
} from './store/uiStore';
import { TOGGLE_BUTTON_ICON } from './templates';

/**
 * App 根组件：管理全局布局、视图切换和外部 CSS 类绑定
 */
export function App({ dataAdapter, appCallbacks }) {
  const [isVisible, setIsVisible] = useState(false);

  // 监听键盘 Esc 键关闭
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setIsVisible(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const toggleUI = () => setIsVisible(!isVisible);

  return (
    <>
      {/* 侧边切换按钮 (原 dom.toggleButton 逻辑) */}
      <div 
        id="log-archive-ui-toggle-button" 
        onClick={toggleUI}
        style={{ display: 'flex' }}
      >
        {TOGGLE_BUTTON_ICON}
      </div>

      {/* 主容器 */}
      <div 
        id="log-archive-ui-container"
        className={isReadOnly.value ? 'is-readonly' : ''}
        style={{ display: isVisible ? 'flex' : 'none' }}
      >
        {/* 顶部状态栏 (替代原有 Header) */}
        <div id="log-archive-ui-header">
           <div className="status-indicator">
              {activeServer.value ? `✅ ${activeServer.value}` : '💤 等待进入游戏...'}
           </div>
           <div className="view-controls">
              <button onClick={() => viewMode.value = 'log'} className={viewMode.value === 'log' ? 'active' : ''}>📜 记录</button>
              <button onClick={() => viewMode.value = 'stats'} className={viewMode.value === 'stats' ? 'active' : ''}>📊 统计</button>
              <button onClick={() => viewMode.value = 'config'} className={viewMode.value === 'config' ? 'active' : ''}>⚙️ 设置</button>
              <button onClick={toggleUI}>❌</button>
           </div>
        </div>

        <div id="log-archive-view-container">
          {/* 
              视图分发点：
              后续我们将实现 LogViewer, ConfigPanel, StatsView 组件
          */}
          {viewMode.value === 'log' && (
            <div className="placeholder-view">
               <h3>Log Viewer (Pending Refactor)</h3>
               <p>Viewing Server: {viewingServer.value}</p>
            </div>
          )}
          
          {viewMode.value === 'config' && (
            <div className="placeholder-view">
               <h3>Settings (Pending Refactor)</h3>
            </div>
          )}

          {viewMode.value === 'stats' && (
             <div className="placeholder-view">
               <h3>Statistics (Pending Refactor)</h3>
             </div>
          )}
        </div>
      </div>
    </>
  );
}
~~~~~

### 下一步建议
我们已经成功挂载了 Preact 引擎并实现了基本的路由/状态桥接。下一步将进入 **阶段三：原子组件拆分**：
1.  **实现 `Header` 组件**：将 `App.jsx` 中的头部逻辑抽离，并加入频道选择器（`channelSelector`）。
2.  **重构 `LogViewer` 组件**：这是最核心的部分。我们将引入 `useLogData` Hook，利用 `useEffect` 处理与 `dataAdapter` 的交互，替代原有的 `refreshView` 方法。
3.  **对接分页组件**：实现声明式的 `Pagination` 组件，直接绑定 `currentPage` Signal。
