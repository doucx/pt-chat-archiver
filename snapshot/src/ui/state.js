import { storageManager } from '../storage/index.js';
import { 
  currentPage, pageSize, statsLimit, readChunkSize, initDebounceMs, cachePages,
  autoFollowServer, totalPages, viewMode, isLockedToBottom, isUIPaused,
  activeServer, recordedChannel, viewingServer, selectedChannel, lastServer,
  updateConfig, initStore
} from './store/uiStore.js';

/**
 * Creates and manages the UI's internal state.
 * (Currently acting as a backwards-compatible Facade for Preact Signals)
 * @returns {Promise<object>} A promise that resolves to a UI state manager instance.
 */
export async function createUIState() {
  await initStore();

  return {
    getState: () => ({
      currentPage: currentPage.value,
      pageSize: pageSize.value,
      statsLimit: statsLimit.value,
      readChunkSize: readChunkSize.value,
      initDebounceMs: initDebounceMs.value,
      cachePages: cachePages.value,
      autoFollowServer: autoFollowServer.value,
      lastSavedTime: null,
      totalPages: totalPages.value,
      viewMode: viewMode.value,
      isLockedToBottom: isLockedToBottom.value,
      isUIPaused: isUIPaused.value,
      activeServer: activeServer.value,
      recordedChannel: recordedChannel.value,
      viewingServer: viewingServer.value,
      selectedChannel: selectedChannel.value,
      lastServer: lastServer.value,
    }),

    setPage: (page) => { 
      currentPage.value = Math.max(1, Math.min(page, totalPages.value)); 
    },
    setTotalPages: (total) => { 
      totalPages.value = Math.max(1, total); 
    },
    setViewMode: (mode) => { 
      if (['log', 'stats', 'config'].includes(mode)) {
        viewMode.value = mode; 
      }
    },
    setPageSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) await updateConfig('pageSize', val);
    },
    setStatsLimit: async (limit) => {
      const val = Number.parseInt(limit, 10);
      if (!Number.isNaN(val) && val >= 100) await updateConfig('statsLimit', val);
    },
    setReadChunkSize: async (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 50) await updateConfig('readChunkSize', val);
    },
    setInitDebounceMs: async (ms) => {
      const val = Number.parseInt(ms, 10);
      if (!Number.isNaN(val) && val >= 50) await updateConfig('initDebounceMs', val);
    },
    setCachePages: async (pages) => {
      const val = Number.parseInt(pages, 10);
      if (!Number.isNaN(val) && val >= 1) await updateConfig('cachePages', val);
    },
    setAutoFollowServer: async (enabled) => {
      await updateConfig('autoFollowServer', !!enabled);
    },
    setLastSavedTime: (isoString) => {
      // Legacy
    },
    togglePause: () => { 
      isUIPaused.value = !isUIPaused.value; 
      return isUIPaused.value; 
    },
    setLockedToBottom: (locked) => { 
      isLockedToBottom.value = !!locked; 
    },
    forcePause: (paused) => { 
      isUIPaused.value = paused; 
    },
    setRecordingStatus: (serverName, channelName) => {
      activeServer.value = serverName;
      recordedChannel.value = channelName;
      if (serverName) {
        lastServer.value = serverName;
        storageManager.setLastServer(serverName); // 立即持久化
      }
      if (autoFollowServer.value || !viewingServer.value) {
        viewingServer.value = serverName;
      }
    },
    setViewingServer: (serverName) => { 
      viewingServer.value = serverName; 
    },
    setSelectedChannel: (channel) => { 
      selectedChannel.value = channel; 
    },
    getSelfName: async () => await storageManager.getSelfName(),
    setSelfName: async (name) => await storageManager.setSelfName(name),
  };
}