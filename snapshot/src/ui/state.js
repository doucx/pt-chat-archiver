import { CONFIG_KEY, SELF_NAME_KEY } from '../constants.js';

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
    const defaultCfg = { pageSize: 1000 };
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      const parsed = stored ? { ...defaultCfg, ...JSON.parse(stored) } : defaultCfg;
      state.pageSize = parsed.pageSize;
    } catch (e) {
      // Use default if config is corrupt
    }
  };

  const saveConfig = () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ pageSize: state.pageSize }));
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
    getSelfName: () => localStorage.getItem(SELF_NAME_KEY) || '',
    setSelfName: (name) => localStorage.setItem(SELF_NAME_KEY, name.trim()),
  };
}