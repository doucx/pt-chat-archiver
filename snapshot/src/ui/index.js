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