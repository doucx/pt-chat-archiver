好的，我们正式开启 `pt-chat-archiver` 的 Preact 重构之旅。

根据路线图，我们现在执行 **阶段一：环境准备与基建搭建**。虽然 `package.json` 中已经预装了相关依赖，但 `vite.config.js` 尚未激活编译插件，且文件结构需要为组件化做准备。同时，为了给阶段二铺路，我们将直接建立基于 Signals 的响应式状态存储。

## [WIP] feat: 开启 Preact 重构 - 阶段一环境准备与基建

### 用户需求
配置 Vite 以支持 Preact (JSX) 开发环境，建立符合组件化规范的目录结构，并初始化基于 `@preact/signals` 的全局状态存储。

### 评论
这是重构中最关键的“地基”步骤。引入 JSX 支持后，我们可以开始将原本散落在 `templates.js` 和 `renderer.js` 中的逻辑通过声明式组件重组。使用 Signals 代替原有的手动状态管理，将极大地简化 UI 更新机制。

### 目标
1.  修改 `vite.config.js`，启用 `@preact/preset-vite`。
2.  创建 `src/ui/` 下的子目录结构：`components/`、`hooks/`、`store/`。
3.  创建 `src/ui/store/uiStore.js`，定义核心响应式状态。
4.  创建 `src/ui/App.jsx` 作为 Preact 根组件入口。

### 基本原理
通过在 Vite 配置中添加 `preact()` 插件，构建工具将能够处理 `.jsx` 文件并将其转换为高效的渲染指令。建立 `uiStore.js` 是为了实现状态与 UI 的解耦：当 Signals 的值改变时，订阅该 Signal 的 Preact 组件会自动重绘，从而彻底废弃原有的 `refreshView()` 手动调用逻辑。

### 标签
#intent/build #flow/ready #priority/high 
#comp/build #comp/ui #concept/state #scope/dx 
#ai/delegate
#task/domain/ui #task/object/preact-refactor #task/action/environment-setup 
#task/state/begin #task/status/active

---

### Script

#### Acts 1: 配置开发环境与目录结构

首先，我们需要让 Vite 能够识别并处理 JSX，并建立必要的文件夹。

~~~~~act
patch_file
vite.config.js
~~~~~
~~~~~javascript.old
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import packageJson from './package.json';
~~~~~
~~~~~javascript.new
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import monkey from 'vite-plugin-monkey';
import packageJson from './package.json';
~~~~~

~~~~~act
patch_file
vite.config.js
~~~~~
~~~~~javascript.old
  plugins: [
    monkey({
~~~~~
~~~~~javascript.new
  plugins: [
    preact(),
    monkey({
~~~~~

~~~~~act
run_command
~~~~~
~~~~~
mkdir -p src/ui/components src/ui/hooks src/ui/store
~~~~~

#### Acts 2: 初始化响应式 Store (uiStore.js)

我们将原 `src/ui/state.js` 中的命令式状态迁移到基于 Signals 的响应式存储中。

~~~~~act
write_file
src/ui/store/uiStore.js
~~~~~
~~~~~javascript
import { signal, computed } from '@preact/signals';
import { storageManager } from '../../storage/index.js';

// --- 全局 UI 状态 ---
export const viewMode = signal('log'); // 'log' | 'stats' | 'config'
export const isUIPaused = signal(false);
export const isLockedToBottom = signal(false);

// --- 存档查看状态 ---
export const viewingServer = signal(null);
export const selectedChannel = signal('Local');
export const currentPage = signal(1);
export const totalPages = signal(1);

// --- 实时录制状态 ---
export const activeServer = signal(null);
export const recordedChannel = signal(null);
export const lastServer = signal(null);

// --- 用户配置 (从 Storage 加载) ---
export const pageSize = signal(1000);
export const statsLimit = signal(5000);
export const readChunkSize = signal(250);
export const initDebounceMs = signal(150);
export const cachePages = signal(5);
export const autoFollowServer = signal(true);

// --- 派生状态 (Computed) ---
export const isReadOnly = computed(() => {
  return activeServer.value !== null && viewingServer.value !== activeServer.value;
});

/**
 * 初始化 Store，从持久化层加载数据
 */
export async function initStore() {
  const config = await storageManager.getConfig();
  lastServer.value = await storageManager.getLastServer();
  
  pageSize.value = config.pageSize || 1000;
  statsLimit.value = config.statsLimit || 5000;
  readChunkSize.value = config.readChunkSize || 250;
  initDebounceMs.value = config.initDebounceMs || 150;
  cachePages.value = config.cachePages || 5;
  autoFollowServer.value = config.autoFollowServer !== false;

  // 如果有持久化的最后服务器，初始化 viewingServer
  if (lastServer.value && !viewingServer.value) {
    viewingServer.value = lastServer.value;
  }
}

/**
 * 统一的状态修改 Action (用于持久化)
 */
export const updateConfig = async (key, value) => {
  const signalMap = {
    pageSize, statsLimit, readChunkSize, initDebounceMs, cachePages, autoFollowServer
  };
  
  if (signalMap[key]) {
    signalMap[key].value = value;
    await storageManager.saveConfig({
      pageSize: pageSize.value,
      statsLimit: statsLimit.value,
      readChunkSize: readChunkSize.value,
      initDebounceMs: initDebounceMs.value,
      cachePages: cachePages.value,
      autoFollowServer: autoFollowServer.value
    });
  }
};
~~~~~

#### Acts 3: 创建根组件 App.jsx

创建一个基础的根组件，作为后续 UI 重构的挂载点。

~~~~~act
write_file
src/ui/App.jsx
~~~~~
~~~~~jsx
import { useEffect } from 'preact/hooks';
import { viewMode, isReadOnly } from './store/uiStore';

/**
 * PT Chat Archiver 根组件
 * 负责分发路由和管理全局容器样式
 */
export function App({ dataAdapter, appCallbacks }) {
  return (
    <div className={`log-archive-app-root ${isReadOnly.value ? 'is-readonly' : ''}`}>
      {/* 
          后续将在此处组装组件：
          <Header />
          <ViewContainer>
             {viewMode.value === 'log' && <LogViewer />}
             {viewMode.value === 'config' && <ConfigPanel />}
             {viewMode.value === 'stats' && <StatsView />}
          </ViewContainer>
      */}
      <div style={{ padding: '20px', color: 'white' }}>
        <h2>Preact Engine Ready</h2>
        <p>Current View: {viewMode.value}</p>
        <p>Status: {isReadOnly.value ? 'ReadOnly' : 'Recording'}</p>
        <button onClick={() => viewMode.value = viewMode.value === 'log' ? 'config' : 'log'}>
          Toggle View (Signal Test)
        </button>
      </div>
    </div>
  );
}
~~~~~

### 下一步建议
环境和状态机已就绪。下一步我们将进入 **阶段二：状态层改造** 的深度集成：
1.  在 `src/ui/index.js` 中调用 `initStore()` 并在 `createUI` 中挂载 Preact `App`。
2.  开始将 `index.js` 中的异步控制逻辑（`refreshView`）迁移到组件的生命周期（如 `useEffect`）中。
3.  逐步将 `src/ui/state.js` 的引用替换为对 `src/ui/store/uiStore.js` 的 Signal 订阅。
