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
    lastSavedTime: null,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
  };

  // Async load config
  const config = await storageManager.getConfig();
  state.pageSize = config.pageSize;
  state.autoSaveInterval = config.autoSaveInterval;

  const saveConfig = async () => {
    await storageManager.saveConfig({
      pageSize: state.pageSize,
      autoSaveInterval: state.autoSaveInterval,
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
      // 如果还没有选择查看哪个服务器，默认跟随当前服务器
      if (!state.viewingServer) {
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
