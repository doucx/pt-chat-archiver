经过分析，在之前的模块化拆分中，我们主要丢失或损坏了以下几个特性：

1.  **下载功能的格式化丢失**: `downloadAllData` 尝试调用 `renderer.formatMessageForDisplay`，但该函数在 `renderer.js` 中是私有的，导致下载的文本文件内容不正确或报错。
2.  **硬编码字符串**: 在 `index.js` 的清理逻辑中使用了硬编码的 `'chatLogArchive_v5'`，而不是使用 `constants.js` 中的常量。
3.  **渲染回调不一致**: `renderer.render` 需要 `detectTotalDuplicates` 等回调来更新“清理按钮”的状态，但在 `updateUI` 调用中传参不完整。
4.  **初始化渲染缺失**: 在 `createUI` 结束时没有进行首次主动渲染。

我将通过以下计划修复这些问题。

## [WIP] refactor: Restore missing UI features and refine modularity

### 用户需求
补全在 UI 模块重构中丢失的特性，修复下载格式化失效、常量引用不当以及渲染状态不一致的问题。

### 评论
在重构过程中，将私有逻辑提取为模块接口是常见的遗漏点。特别是 `formatMessageForDisplay` 这种跨模块（渲染和下载）使用的逻辑，应当明确其公开地位。此外，保持常量的统一引用对于系统的健壮性至关重要。

### 目标
1.  在 `src/ui/renderer.js` 中导出 `formatMessageForDisplay`。
2.  在 `src/ui/index.js` 中引入 `STORAGE_KEY_V5` 常量。
3.  修复 `index.js` 中的 `downloadAllData` 逻辑，使其正确使用导出格式化函数。
4.  统一 `renderer.render` 的回调传递逻辑。
5.  确保 `createUI` 初始化时执行首次渲染。

### 基本原理
为了保证模块间的低耦合和功能完整性：
-   **提取工具函数**: 将消息格式化逻辑从渲染器私有域提升到模块级导出。
-   **消除魔法字符串**: 强制使用 `constants.js` 维护存储键名。
-   **闭包捕获与传递**: 在 `index.js` 中构建完整的 `uiCallbacks` 对象，并确保在 `updateUI` 和 `events.js` 中传递的是同一套逻辑。

### 标签
#intent/fix #flow/ready #priority/high #comp/cli #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/module-refinement #task/action/restoration #task/state/continue

---

### Script

#### Acts 1: 公开格式化函数并重定义 renderer 接口

修改 `src/ui/renderer.js`，将 `formatMessageForDisplay` 提升为导出函数，以便在下载逻辑中使用。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
/**
 * Creates a renderer instance responsible for updating the UI DOM.
 * @param {object} dom - The DOM elements object from dom.js.
 * @param {object} uiState - The UI state manager from state.js.
 * @returns {object} A renderer instance.
 */
export function createRenderer(dom, uiState) {
  // --- Private Helper Functions ---
  const formatMessageForDisplay = (msg) => {
    let prefix = '';
    if (msg.type.includes('party')) prefix = '👥 ';
    else if (msg.type.includes('whisper')) prefix = '💬 ';
    else if (msg.type.includes('announcement')) prefix = '📣 ';
    const displayTime = formatISOTimeForDisplay(msg.time);
    return `${displayTime} ${prefix}${msg.content}`;
  };

  const updateTextareaAndPreserveSelection = (updateFn) => {
~~~~~
~~~~~javascript.new
/**
 * Formats a single message object into a display string for the UI or text export.
 * @param {object} msg - The message object.
 * @returns {string} Formatted string.
 */
export function formatMessageForDisplay(msg) {
  let prefix = '';
  if (msg.type.includes('party')) prefix = '👥 ';
  else if (msg.type.includes('whisper')) prefix = '💬 ';
  else if (msg.type.includes('announcement')) prefix = '📣 ';
  const displayTime = formatISOTimeForDisplay(msg.time);
  return `${displayTime} ${prefix}${msg.content}`;
}

/**
 * Creates a renderer instance responsible for updating the UI DOM.
 * @param {object} dom - The DOM elements object from dom.js.
 * @param {object} uiState - The UI state manager from state.js.
 * @returns {object} A renderer instance.
 */
export function createRenderer(dom, uiState) {
  // --- Private Helper Functions ---
  const updateTextareaAndPreserveSelection = (updateFn) => {
~~~~~

#### Acts 2: 修复 index.js 的常量引用、下载逻辑和渲染参数

在 `src/ui/index.js` 中引入缺失的常量，修复 `downloadAllData` 的格式化调用，并统一渲染回调。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
import { bindUIEvents } from './events.js';
import { createRenderer } from './renderer.js';
import { createUIState } from './state.js';
import { getDOMElements, initDOM } from './dom.js';

/**
 * Initializes and orchestrates the entire UI module.
~~~~~
~~~~~javascript.new
import { STORAGE_KEY_V5 } from '../constants.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
import { createRenderer, formatMessageForDisplay } from './renderer.js';
import { createUIState } from './state.js';

/**
 * Initializes and orchestrates the entire UI module.
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const downloadAllData = () => {
    if (Object.keys(appState).length === 0) return;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const baseFilename = `pt-saver-${timestamp}`;
    let allTextContent = '';
    for (const channelName in appState) {
      allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
      allTextContent += appState[channelName]
        .map((msg) => renderer.formatMessageForDisplay(msg)) // Re-use formatter logic if needed or define locally
        .join('\n');
    }
    const triggerDownload = (content, filename, mimeType) => {
~~~~~
~~~~~javascript.new
  const downloadAllData = () => {
    if (Object.keys(appState).length === 0) return;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const baseFilename = `pt-saver-${timestamp}`;
    let allTextContent = '';
    for (const channelName in appState) {
      allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
      allTextContent += appState[channelName].map(formatMessageForDisplay).join('\n');
    }
    const triggerDownload = (content, filename, mimeType) => {
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const clearAllData = () => {
      if(confirm('【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？')) {
        appCallbacks.deactivateLogger();
        localStorage.removeItem('chatLogArchive_v5'); // Direct access for critical op
        for (const key of Object.keys(appState)) {
          delete appState[key];
        }
~~~~~
~~~~~javascript.new
  const clearAllData = () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      localStorage.removeItem(STORAGE_KEY_V5); // 使用常量
      for (const key of Object.keys(appState)) {
        delete appState[key];
      }
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  bindUIEvents({
    dom,
    uiState,
    renderer,
    getAppState,
    callbacks: { ...appCallbacks, cleanChannelRecords, clearAllData, copyAllData, downloadAllData },
  });

  // 4. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        renderer.render(appState, { ...appCallbacks, cleanChannelRecords, copyAllData, downloadAllData });
      }
    },
    checkStorageUsage: renderer.checkStorageUsage,
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: renderer.updateServerDisplay,
  };
}
~~~~~
~~~~~javascript.new
  const uiCallbacks = {
    ...appCallbacks,
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    downloadAllData,
  };

  bindUIEvents({
    dom,
    uiState,
    renderer,
    getAppState,
    callbacks: uiCallbacks,
  });

  // 4. Initial Render
  renderer.render(appState, uiCallbacks);

  // 5. Return the public API
  return {
    updateUI: () => {
      if (!uiState.getState().isUIPaused) {
        renderer.render(appState, uiCallbacks);
      }
    },
    checkStorageUsage: renderer.checkStorageUsage,
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: renderer.updateServerDisplay,
  };
}
~~~~~

### 下一步建议
1.  **验证下载内容**: 触发一次下载操作，检查生成的 `.txt` 文件中是否包含正确的时间戳和 Emoji 符号，确保 `formatMessageForDisplay` 已生效。
2.  **验证清理状态**: 在配置界面检查“清理重复记录”按钮是否在存在重复时显示数量。
3.  **准备提交**: 如果功能已完全对齐，下一步可以进行 `[COMMIT]`。
