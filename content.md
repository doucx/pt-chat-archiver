好的，我们开始第一步：实施服务器检测功能。

根据你的要求，我们将：
1.  在 `parser.js` 中添加检测服务器名称的逻辑。
2.  在 `main.js` 中建立一个持续运行的观察者，实时更新当前检测到的服务器。
3.  在 UI 界面中增加一个显示当前检测到的服务器的区域。
4.  **保持数据结构不变**（即 `inMemoryChatState` 依然是目前的格式）。

这是实现“服务器感知”的第一步，为后续的数据隔离和迁移打下基础。

## [WIP] feat: 实现服务器检测功能

### 用户需求
脚本需要能够检测当前用户所在的服务器（如 "Safe Chinese"），并在 UI 界面上实时显示检测到的结果。

### 评论
通过实时监控 DOM 中的“Play”按钮，我们可以可靠地获取服务器名称。由于用户可能在不刷新页面的情况下退出并重新进入不同服务器（或者在加载界面切换），保持观察者运行是必要的。

### 目标
1.  在 `parser.js` 中实现服务器名提取函数。
2.  在 `main.js` 中新增全局变量 `detectedServerName`。
3.  在 `main.js` 中设置一个 `MutationObserver` 专门负责寻找和更新服务器名。
4.  更新 `templates.js` 和 `ui.js`，在界面头部显示当前检测到的服务器。

### 基本原理
利用 Pony Town 开始界面中绿色的 "Play" 按钮包含服务器名称的特性。该按钮的结构通常为 `button.btn-success` 下包含一个 `span`。即使进入游戏后该按钮消失，我们也会保留最后一次检测到的有效名称。

### 标签
#intent/build #flow/ready #priority/high 
#comp/engine #comp/parser #comp/ui #scope/ux 
#ai/brainstorm
#task/domain/core
#task/object/server-detection
#task/action/implementation
#task/state/begin

---

### Script

#### Acts 1: 在 `parser.js` 中添加解析逻辑

我们将添加 `extractServerFromDOM` 函数，它专门寻找开始界面的 Play 按钮。

~~~~~act
patch_file
src/parser.js
~~~~~
~~~~~javascript.old
/** 从 tabs 元素的 HTML 中解析出当前活跃的标签页名称。*/
export function findActiveTabByClass(htmlString) {
  if (!htmlString) return null;
  const container = document.createElement('div');
  container.innerHTML = htmlString;
  const activeTab = container.querySelector('a.chat-log-tab.active');
  return activeTab ? activeTab.textContent.trim() : null;
}
~~~~~
~~~~~javascript.new
/** 从开始界面的 Play 按钮中提取服务器名称。*/
export function extractServerFromDOM() {
  const playButton = document.querySelector('button.btn-success');
  if (!playButton) return null;

  // 寻找按钮内的 span 元素，它通常包含服务器名称
  const serverSpan = playButton.querySelector('span');
  if (serverSpan && serverSpan.textContent.trim()) {
    return serverSpan.textContent.trim();
  }

  // 回退方案：尝试解析整个按钮的文本
  const text = playButton.textContent.trim();
  const match = text.match(/Play on (.*)/i);
  return match ? match[1].trim() : null;
}

/** 从 tabs 元素的 HTML 中解析出当前活跃的标签页名称。*/
export function findActiveTabByClass(htmlString) {
  if (!htmlString) return null;
  const container = document.createElement('div');
  container.innerHTML = htmlString;
  const activeTab = container.querySelector('a.chat-log-tab.active');
  return activeTab ? activeTab.textContent.trim() : null;
}
~~~~~

#### Acts 2: 更新 `templates.js` 以支持显示服务器名

在标题旁边增加一个用于显示服务器状态的占位符。

~~~~~act
patch_file
src/templates.js
~~~~~
~~~~~javascript.old
export const getMainContainerHTML = (version) => `
    <div id="log-archive-ui-header">
        <h2>聊天记录存档 v${version}</h2>
        <div id="log-archive-ui-controls">
            <select id="log-archive-channel-selector" class="log-archive-ui-button"></select>
~~~~~
~~~~~javascript.new
export const getMainContainerHTML = (version) => `
    <div id="log-archive-ui-header">
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <h2 style="margin-bottom: 0;">聊天记录存档 v${version}</h2>
            <div id="log-archive-server-status" class="info-text-dim" style="font-size: 0.8em; color: var(--color-primary-hover);">
                检测中...
            </div>
        </div>
        <div id="log-archive-ui-controls">
            <select id="log-archive-channel-selector" class="log-archive-ui-button"></select>
~~~~~

#### Acts 3: 在 `ui.js` 中增加更新服务器显示的接口

我们将修改 `createUI` 返回的句柄，允许外部更新显示的服务器名称。

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
    isUIPaused: () => isUIPaused,
  };
}
~~~~~
~~~~~javascript.new
    isUIPaused: () => isUIPaused,
    updateServerDisplay: (serverName) => {
      const statusElement = document.getElementById('log-archive-server-status');
      if (statusElement) {
        statusElement.textContent = serverName ? `服务器: ${serverName}` : '等待进入游戏...';
      }
    },
  };
}
~~~~~

#### Acts 4: 在 `main.js` 中实现检测逻辑

这是核心变更，我们将引入 `detectedServerName` 并开启 `serverObserver`。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import './style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import {
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_WARNING_THRESHOLD_MB,
} from './constants.js';
import { extractUsefulData, findActiveTabByClass, locateChatElements } from './parser.js';
import {
~~~~~
~~~~~javascript.new
import './style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import {
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_WARNING_THRESHOLD_MB,
} from './constants.js';
import {
  extractServerFromDOM,
  extractUsefulData,
  findActiveTabByClass,
  locateChatElements,
} from './parser.js';
import {
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  let inMemoryChatState = {};
  let messageObserver = null;
  let tabObserver = null;
  let currentActiveChannel = null;
  let isInitializingChat = false;
  let isSwitchingTabs = false;
  // UI 控制句柄
  let uiControls = null;
~~~~~
~~~~~javascript.new
  let inMemoryChatState = {};
  let messageObserver = null;
  let tabObserver = null;
  let serverObserver = null;
  let currentActiveChannel = null;
  let detectedServerName = null;
  let isInitializingChat = false;
  let isSwitchingTabs = false;
  // UI 控制句柄
  let uiControls = null;
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /** 脚本主入口函数。*/
  function main() {
    migrateDataV4toV5();
    inMemoryChatState = loadMessagesFromStorage();
    uiControls = createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage,
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
    });

    uiControls.checkStorageUsage();

    const uiObserver = new MutationObserver(() => {
~~~~~
~~~~~javascript.new
  /** 脚本主入口函数。*/
  function main() {
    migrateDataV4toV5();
    inMemoryChatState = loadMessagesFromStorage();
    uiControls = createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage,
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
    });

    uiControls.checkStorageUsage();

    // --- 启动服务器检测观察者 ---
    const updateServer = () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] 检测到服务器切换: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }
      }
    };

    serverObserver = new MutationObserver(updateServer);
    serverObserver.observe(document.body, { childList: true, subtree: true });
    updateServer(); // 立即执行一次

    const uiObserver = new MutationObserver(() => {
~~~~~

### 下一步建议

我们已经成功实现了实时的服务器检测。现在，每当你停留在 Pony Town 的开始界面时，脚本就会抓取服务器名，并在 UI 的左上角实时显示。

**下一步：**
我们将实施**数据结构的升级 (v6)**。我们需要定义新的 `STORAGE_KEY_V6`，并实现那个交互式的迁移引导逻辑：
1.  检测到旧数据时，向用户询问“是否将旧数据合并到当前检测到的服务器 [xxx]”。
2.  实现基于服务器名隔离的读写逻辑。

是否准备好进入下一步的数据迁移环节？
