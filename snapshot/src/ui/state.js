import { storageManager } from '../storage/index.js';

/**
 * Creates and manages the UI's internal state.
 * @returns {Promise<object>} A promise that resolves to a UI state manager instance.
 */
export async function createUIState() {
  const state = {
    currentPage: 1,
    pageSize: 1000,
    autoSaveInterval: 30,
    autoFollowServer: true,
    lastSavedTime: null,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
  };

  // Async load config
  const config = await storageManager.getConfig();
  state.pageSize = config.pageSize || 1000;
  state.autoSaveInterval = config.autoSaveInterval || 30;
  state.autoFollowServer = config.autoFollowServer !== false; // 默认为 true

  const saveConfig = async () => {
    await storageManager.saveConfig({
      pageSize: state.pageSize,
      autoSaveInterval: state.autoSaveInterval,
      autoFollowServer: state.autoFollowServer,
    });
  };

  return {
    getState: () => ({ ...state }),

    setPage: (page) => {
      state.currentPage = Math.max(1, Math.min(page, state.totalPages));
    },
    setTotalPages: (total) => {
      state.totalPages = Math.max(1, total);
    },
    setViewMode: (mode) => {
      if (['log', 'stats', 'config'].includes(mode)) {
        state.viewMode = mode;
      }
    },
    setPageSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        await saveConfig();
      }
    },
    setAutoSaveInterval: async (seconds) => {
      const val = Number.parseInt(seconds, 10);
      if (!Number.isNaN(val) && val >= 5) {
        state.autoSaveInterval = val;
        await saveConfig();
      }
    },
    setAutoFollowServer: async (enabled) => {
      state.autoFollowServer = !!enabled;
      await saveConfig();
    },
    setLastSavedTime: (isoString) => {
      state.lastSavedTime = isoString;
    },
    togglePause: () => {
      state.isUIPaused = !state.isUIPaused;
      return state.isUIPaused;
    },
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
    setActiveServer: (serverName) => {
      state.activeServer = serverName;
      // 如果开启了自动跟随，或者这是第一次检测到服务器，则更新查看视图
      if (state.autoFollowServer || !state.viewingServer) {
        state.viewingServer = serverName;
      }
    },
    setViewingServer: (serverName) => {
      state.viewingServer = serverName;
    },
    getSelfName: async () => await storageManager.getSelfName(),
    setSelfName: async (name) => await storageManager.setSelfName(name),
  };
}
