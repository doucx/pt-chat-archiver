import { TOGGLE_BUTTON_ICON, getMainContainerHTML } from './templates.js';

let domElements = null;

/**
 * Creates and injects the main UI container and toggle button into the document body.
 * This function should only be called once.
 * @param {string} version - The application version to display in the header.
 */
export function initDOM(version) {
  // Reset cache on re-initialization, crucial for testing environments.
  domElements = null;

  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
  container.innerHTML = getMainContainerHTML(version);
  document.body.appendChild(container);

  const toggleButton = document.createElement('div');
  toggleButton.id = 'log-archive-ui-toggle-button';
  toggleButton.textContent = TOGGLE_BUTTON_ICON;
  document.body.appendChild(toggleButton);
}

/**
 * Finds and caches references to all key UI elements.
 * Returns a singleton object containing the element references.
 * @returns {object} An object with references to the UI's DOM elements.
 */
export function getDOMElements() {
  if (domElements) {
    return domElements;
  }

  domElements = {
    // Containers
    uiContainer: document.getElementById('log-archive-ui-container'),
    logView: document.getElementById('log-archive-log-view'),
    configView: document.getElementById('log-archive-config-view'),
    header: document.getElementById('log-archive-ui-header'),

    // Buttons & Inputs
    channelSelector: document.getElementById('log-archive-channel-selector'),
    logDisplay: document.getElementById('log-archive-ui-log-display'),
    copyButton: document.getElementById('log-archive-copy-button'),
    closeButton: document.getElementById('log-archive-close-button'),
    downloadButton: document.getElementById('log-archive-download-button'),
    statsButton: document.getElementById('log-archive-stats-button'),
    settingsButton: document.getElementById('log-archive-settings-button'),
    pauseButton: document.getElementById('log-archive-pause-button'),
    mainResetButton: document.getElementById('log-archive-main-reset-button'),
    readOnlyIndicator: document.getElementById('log-archive-readonly-indicator'),
    toggleButton: document.getElementById('log-archive-ui-toggle-button'),

    // Config View Controls
    serverViewSelector: document.getElementById('log-archive-server-view-selector'),
    resetServerButton: document.getElementById('log-archive-reset-server-button'),
    autoFollowInput: document.getElementById('log-archive-auto-follow-input'),
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    statsLimitInput: document.getElementById('log-archive-stats-limit-input'),
    readChunkInput: document.getElementById('log-archive-read-chunk-input'),
    initDebounceInput: document.getElementById('log-archive-init-debounce-input'),
    cachePagesInput: document.getElementById('log-archive-cache-pages-input'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
    configMsgCount: document.getElementById('log-archive-config-msg-count'),
    legacyRecoveryGroup: document.getElementById('log-archive-legacy-recovery-group'),
    legacyInfoText: document.getElementById('log-archive-legacy-info'),
    recoverButton: document.getElementById('log-archive-recover-button'),
    ignoreLegacyButton: document.getElementById('log-archive-ignore-legacy-button'),
    deleteBackupGroup: document.getElementById('log-archive-delete-backup-group'),
    deleteBackupButton: document.getElementById('log-archive-delete-backup-button'),
    cleanButton: document.getElementById('log-archive-clean-button'),
    copyJsonButton: document.getElementById('log-archive-copy-json-button'),
    copyTxtButton: document.getElementById('log-archive-copy-txt-button'),
    downloadJsonButton: document.getElementById('log-archive-download-json-button'),
    downloadTxtButton: document.getElementById('log-archive-download-txt-button'),
    importButton: document.getElementById('log-archive-import-button'),
    importMergeButton: document.getElementById('log-archive-import-merge-button'),
    clearButton: document.getElementById('log-archive-clear-button'),

    // Pagination Controls
    paginationControls: document.getElementById('log-archive-ui-pagination-controls'),
    pageFirstBtn: document.getElementById('page-first'),
    pagePrevBtn: document.getElementById('page-prev'),
    pageNextBtn: document.getElementById('page-next'),
    pageLastBtn: document.getElementById('page-last'),
    pageInfoSpan: document.getElementById('page-info'),

    // Status Display
    serverStatus: document.getElementById('log-archive-server-status'),
  };
  return domElements;
}
