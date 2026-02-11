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
    toggleButton: document.getElementById('log-archive-ui-toggle-button'),

    // Config View Controls
    serverViewSelector: document.getElementById('log-archive-server-view-selector'),
    resetServerButton: document.getElementById('log-archive-reset-server-button'),
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    autoSaveIntervalInput: document.getElementById('log-archive-auto-save-interval'),
    lastSavedInfo: document.getElementById('log-archive-last-saved-info'),
    saveNowButton: document.getElementById('log-archive-save-now-button'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
    configMsgCount: document.getElementById('log-archive-config-msg-count'),
    deleteBackupGroup: document.getElementById('log-archive-delete-backup-group'),
    deleteBackupButton: document.getElementById('log-archive-delete-backup-button'),
    cleanButton: document.getElementById('log-archive-clean-button'),
    copyAllButton: document.getElementById('log-archive-copy-all-button'),
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
