import { storage } from '../storage.js';

/**
 * Creates and manages the UI's internal state.
 * @returns {object} A UI state manager instance.
 */
export function createUIState() {
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

  const loadConfig = () => {
    const config = storage.getConfig();
    state.pageSize = config.pageSize;
    state.autoSaveInterval = config.autoSaveInterval;
  };

  const saveConfig = () => {
    storage.saveConfig({
      pageSize: state.pageSize,
      autoSaveInterval: state.autoSaveInterval,
    });
  };

  // Initial load
  loadConfig();

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
    setPageSize: (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        saveConfig();
      }
    },
    setAutoSaveInterval: (seconds) => {
      const val = Number.parseInt(seconds, 10);
      if (!Number.isNaN(val) && val >= 5) {
        state.autoSaveInterval = val;
        saveConfig();
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
    getSelfName: () => storage.getSelfName(),
    setSelfName: (name) => storage.setSelfName(name),
  };
}
