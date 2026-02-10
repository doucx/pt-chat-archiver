import { storage } from '../storage.js';

/**
 * Creates and manages the UI's internal state.
 * @returns {object} A UI state manager instance.
 */
export function createUIState() {
  const state = {
    currentPage: 1,
    pageSize: 1000,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
  };

  const loadConfig = () => {
    const config = storage.getConfig();
    state.pageSize = config.pageSize;
  };

  const saveConfig = () => {
    storage.saveConfig({ pageSize: state.pageSize });
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
    togglePause: () => {
      state.isUIPaused = !state.isUIPaused;
      return state.isUIPaused;
    },
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
    getSelfName: () => storage.getSelfName(),
    setSelfName: (name) => storage.setSelfName(name),
  };
}
