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
export const selfName = signal('');

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
  selfName.value = await storageManager.getSelfName();

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