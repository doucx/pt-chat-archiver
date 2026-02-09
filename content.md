好的，我们开始执行第一步重构。

我们将创建一个专门的 `src/templates.js` 文件来存放 HTML 结构，并修改 `src/ui.js` 以引用这些模块化的模板。这不仅能清理逻辑代码，还为后续在模板中插入分页控件提供了更整洁的接口。

## [WIP] refactor(ui): 将 HTML 模板提取到独立模块

### 用户需求
将 `ui.js` 中硬编码的 HTML 字符串提取到专门的模板文件中，实现逻辑与表现的分离。

### 评论
这是解耦 UI 逻辑的关键一步。目前 `ui.js` 承担了太多的字符串拼接工作，导致代码冗长且难以维护。通过将其移动到 `templates.js`，我们可以更清晰地看到 UI 的静态结构，并且能够通过函数传参（如版本号、未来的分页数据）来动态生成内容。

### 目标
1.  新建 `src/templates.js`。
2.  定义并导出主容器模板函数 `getMainContainerHTML`。
3.  在 `src/ui.js` 中引入并应用这些模板，移除原有的硬编码字符串。

### 基本原理
我们采用“模板函数”模式。在 `templates.js` 中定义接收参数（如 `version`）并返回 HTML 字符串的函数。这种方式比纯字符串更灵活，因为它允许在不引入复杂模板引擎的情况下，保留 Vite 的全局常量（如 `__APP_VERSION__`）的动态注入能力。

### 标签
#intent/refine #flow/ready #priority/medium 
#comp/ui #concept/ui #scope/dx 
#ai/instruct 
#task/domain/ui #task/object/ui-refactor-pagination #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 创建模板模块并重构 UI 初始化逻辑

我们将创建 `src/templates.js` 并将 `src/ui.js` 中的 DOM 构造逻辑重构。

~~~~~act
write_file
src/templates.js
~~~~~
~~~~~javascript
/**
 * 返回 UI 主容器的 HTML 结构。
 * @param {string} version - 应用程序版本号。
 * @returns {string}
 */
export const getMainContainerHTML = (version) => `
    <div id="log-archive-ui-header">
        <h2>聊天记录存档 v${version}</h2>
        <div id="log-archive-ui-controls">
            <input type="text" id="log-archive-self-name-input" placeholder="输入你的昵称...">
            <select id="log-archive-channel-selector" class="log-archive-ui-button"></select>
            <button id="log-archive-refresh-button" class="log-archive-ui-button">刷新</button>
            <button id="log-archive-pause-button" class="log-archive-ui-button">⏸️ </button>
            <button id="log-archive-stats-button" class="log-archive-ui-button">查看统计</button>
            <button id="log-archive-copy-button" class="log-archive-ui-button">复制</button>
            <button id="log-archive-copy-all-button" class="log-archive-ui-button">复制(JSON)</button>
            <button id="log-archive-download-button" class="log-archive-ui-button">下载</button>
            <button id="log-archive-clean-button" class="log-archive-ui-button">清理重复</button>
            <button id="log-archive-clear-button" class="log-archive-ui-button">清空</button>
            <button id="log-archive-close-button" class="log-archive-ui-button">关闭</button>
        </div>
    </div>
    <textarea id="log-archive-ui-log-display" readonly></textarea>
`;

export const TOGGLE_BUTTON_ICON = '📜';
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
import { SELF_NAME_KEY, STORAGE_KEY_V5 } from './constants.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from './utils.js';

/**
~~~~~
~~~~~javascript.new
import { SELF_NAME_KEY, STORAGE_KEY_V5 } from './constants.js';
import { getMainContainerHTML, TOGGLE_BUTTON_ICON } from './templates.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from './utils.js';

/**
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
  container.innerHTML = `
            <div id="log-archive-ui-header">
                <h2>聊天记录存档 v${__APP_VERSION__}</h2>
                <div id="log-archive-ui-controls">
                    <input type="text" id="log-archive-self-name-input" placeholder="输入你的昵称...">
                    <select id="log-archive-channel-selector" class="log-archive-ui-button"></select>
                    <button id="log-archive-refresh-button" class="log-archive-ui-button">刷新</button>
                    <button id="log-archive-pause-button" class="log-archive-ui-button">⏸️ </button>
                    <button id="log-archive-stats-button" class="log-archive-ui-button">查看统计</button>
                    <button id="log-archive-copy-button" class="log-archive-ui-button">复制</button>
                    <button id="log-archive-copy-all-button" class="log-archive-ui-button">复制(JSON)</button>
                    <button id="log-archive-download-button" class="log-archive-ui-button">下载</button>
                    <button id="log-archive-clean-button" class="log-archive-ui-button">清理重复</button>
                    <button id="log-archive-clear-button" class="log-archive-ui-button">清空</button>
                    <button id="log-archive-close-button" class="log-archive-ui-button">关闭</button>
                </div>
            </div>
            <textarea id="log-archive-ui-log-display" readonly></textarea>
        `;
  document.body.appendChild(container);

  const toggleButton = document.createElement('div');
  toggleButton.id = 'log-archive-ui-toggle-button';
  toggleButton.textContent = '📜';
  document.body.appendChild(toggleButton);
~~~~~
~~~~~javascript.new
  const container = document.createElement('div');
  container.id = 'log-archive-ui-container';
  container.innerHTML = getMainContainerHTML(__APP_VERSION__);
  document.body.appendChild(container);

  const toggleButton = document.createElement('div');
  toggleButton.id = 'log-archive-ui-toggle-button';
  toggleButton.textContent = TOGGLE_BUTTON_ICON;
  document.body.appendChild(toggleButton);
~~~~~

### 下一步建议
1.  **提取统计逻辑**：目前 `ui.js` 中仍有大量关于数据分析的代码（如 `calculateTopTalkers` 等），建议将其移至新文件 `src/stats.js`。
2.  **引入状态管理**：在 `ui.js` 中定义一个 `uiState` 对象，用于跟踪当前的 `currentPage`。
3.  **实现分页切片**：在 `displayChatLog` 中应用 `uiState.currentPage` 对消息数组进行 `slice` 处理。
