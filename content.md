好的，我们来执行这次核心重构。将所有与 DOM 交互和解析相关的代码封装起来，是使这个脚本变得健壮和易于维护的关键一步。

---

## [WIP] refactor: 提取 DOM 解析逻辑至 parser.js

### 用户需求
将 `src/main.js` 中所有负责读取、解析和从 DOM 中提取信息的函数，全部迁移到一个新的模块 `src/parser.js` 中。

### 评论
这是本次重构中最重要的一步。通过将“如何读取屏幕”的逻辑（解析器）与“如何处理数据”的逻辑（主流程）分离，我们极大地降低了代码的耦合度。如果未来 PonyTown 更新了 UI 布局，我们只需要修改 `parser.js` 这个文件，而无需触碰核心的状态管理和业务逻辑，这使得维护成本大大降低。

### 目标
1.  创建 `src/parser.js` 文件。
2.  将 `isCharacterInPrivateUseArea`, `customTextContent`, `extractUsefulData`, `locateChatElements`, 和 `findActiveTabByClass` 函数移动到新文件中并导出。
3.  更新 `src/main.js`，移除这些函数的本地定义，并通过 `import` 语句从 `parser.js` 引入它们。

### 基本原理
我们将所有与 DOM 结构紧密相关的代码隔离到一个“解析层”。该层对外提供一个稳定的接口（例如 `extractUsefulData`），主程序调用这个接口获取结构化数据，而无需关心数据是如何从复杂的 DOM 树中被提取出来的。

### 标签
#intent/refine #flow/ready #priority/high #comp/core #concept/parser #scope/core #ai/instruct #task/domain/refactoring #task/object/modularity #task/action/extraction #task/state/continue

---

### Script

#### Acts 1: 创建解析器模块

我们创建一个新文件 `src/parser.js`，并将所有相关的 DOM 解析函数放入其中。

~~~~~act
write_file
src/parser.js
~~~~~
~~~~~javascript
import { MAIN_SERVER_HOSTS } from './constants.js';

/** 判断一个字符的 Unicode 码点是否位于私有使用区。*/
function isCharacterInPrivateUseArea(char) {
  if (!char) return false;
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;
  const isInPUA = (codePoint >= 0xE000 && codePoint <= 0xF8FF);
  const isInSupPUA_A = (codePoint >= 0xF0000 && codePoint <= 0xFFFFD);
  const isInSupPUA_B = (codePoint >= 0x100000 && codePoint <= 0x10FFFD);
  return isInPUA || isInSupPUA_A || isInSupPUA_B;
}

/** 递归地从 DOM 节点中提取可见文本，并正确处理 Emoji 图片。*/
function customTextContent(node) {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) { return node.textContent; }
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.style.display === 'none') { return ''; }
    if (node.tagName === 'IMG' && node.classList.contains('pixelart')) {
      const alt = node.alt || '';
      const label = node.getAttribute('aria-label');
      if (alt && !isCharacterInPrivateUseArea(alt)) { return alt; }
      if (label) { return `:${label}:`; }
      return '';
    }
    let text = '';
    for (const child of node.childNodes) { text += customTextContent(child); }
    return text;
  }
  return '';
}

/**
 * 双模解析引擎：从聊天行元素中提取结构化信息。
 * 根据当前域名自动选择精细解析（主服务器）或回落（私服）模式。
 */
export function extractUsefulData(chatLineElement, selfName, precomputedTime) {
  if (!chatLineElement || !precomputedTime) return null;

  const hostname = window.location.hostname;
  const isMainServerMode = MAIN_SERVER_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));

  if (isMainServerMode) {
    // --- 主服务器精细解析模式 ---
    const data = { time: precomputedTime, type: 'unknown', sender: 'System', receiver: 'Local', content: '' };
    const cl = chatLineElement.classList;
    if (cl.contains('chat-line-whisper-thinking')) data.type = 'whisper-think';
    else if (cl.contains('chat-line-whisper')) data.type = 'whisper';
    else if (cl.contains('chat-line-party-thinking')) data.type = 'party-think';
    else if (cl.contains('chat-line-party')) data.type = 'party';
    else if (cl.contains('chat-line-thinking')) data.type = 'think';
    else if (cl.contains('chat-line-meta-line')) data.type = 'system';
    else if (cl.contains('chat-line-announcement')) data.type = 'announcement';
    else if (cl.contains('chat-line')) data.type = 'say';

    // 通过克隆节点并移除无关部分来提取完整的消息文本，这种方法稳健且能保留上下文
    const container = chatLineElement.cloneNode(true);
    container.querySelectorAll('.chat-line-timestamp, .chat-line-lead').forEach(el => el.remove());
    data.content = customTextContent(container).replace(/\s+/g, ' ').trim();

    const nameNode = chatLineElement.querySelector('.chat-line-name');
    const nameText = nameNode ? customTextContent(nameNode).replace(/^\[|\]$/g, '').trim() : null;

    if (data.type === 'system') return data;

    if (data.type.includes('party')) {
      data.receiver = 'Party';
      if (nameText) data.sender = nameText;
    } else if (data.type.includes('whisper')) {
      // 基于完整的消息内容判断私聊方向
      if (data.content.startsWith('To ') || data.content.startsWith('Thinks to ')) {
        data.sender = selfName || 'Me (未设置)';
        data.receiver = nameText || 'Unknown';
      } else {
        data.sender = nameText || 'Unknown';
        data.receiver = selfName || 'Me (未设置)';
      }
    } else {
      data.receiver = 'Local';
      if (nameText) data.sender = nameText;
    }
    return data;

  } else {
    // --- 回落模式 (兼容私服) ---
    const rawContent = customTextContent(chatLineElement);
    if (!rawContent.trim()) return null;

    return {
      time: precomputedTime,
      is_fallback: true,
      type: '', sender: '', receiver: '',
      content: rawContent.trim()
    };
  }
}

/** 定位页面上的关键聊天元素。*/
export function locateChatElements() {
  return {
    tabs: document.querySelector('.chat-log-tabs'),
    chatLog: document.querySelector('.chat-log-scroll-inner'),
    chatLine: document.querySelector('.chat-line'),
    chatLogContainer: document.querySelector('.chat-log')
  };
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

#### Acts 2: 更新主入口文件以使用新模块

我们在 `src/main.js` 的顶部添加新的 `import` 语句，并移除旧的函数定义。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import './style.css';
import { STORAGE_KEY_V5, OLD_STORAGE_KEY_V4, SELF_NAME_KEY, STORAGE_WARNING_THRESHOLD_MB, MAIN_SERVER_HOSTS } from './constants.js';
import { getStorageUsageInMB, debounce, getISOTimestamp, formatISOTimeForDisplay } from './utils.js';

(function() {
~~~~~
~~~~~javascript.new
import './style.css';
import { STORAGE_KEY_V5, OLD_STORAGE_KEY_V4, SELF_NAME_KEY, STORAGE_WARNING_THRESHOLD_MB } from './constants.js';
import { getStorageUsageInMB, debounce, getISOTimestamp, formatISOTimeForDisplay } from './utils.js';
import { extractUsefulData, locateChatElements, findActiveTabByClass } from './parser.js';

(function() {
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /*
   * =================================================================
   * 核心功能模块
   * =================================================================
   */

  // --- DOM 解析 ---

  /** 判断一个字符的 Unicode 码点是否位于私有使用区。*/
  function isCharacterInPrivateUseArea(char) {
    if (!char) return false;
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) return false;
    const isInPUA = (codePoint >= 0xE000 && codePoint <= 0xF8FF);
    const isInSupPUA_A = (codePoint >= 0xF0000 && codePoint <= 0xFFFFD);
    const isInSupPUA_B = (codePoint >= 0x100000 && codePoint <= 0x10FFFD);
    return isInPUA || isInSupPUA_A || isInSupPUA_B;
  }

  /** 递归地从 DOM 节点中提取可见文本，并正确处理 Emoji 图片。*/
  function customTextContent(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) { return node.textContent; }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.style.display === 'none') { return ''; }
      if (node.tagName === 'IMG' && node.classList.contains('pixelart')) {
        const alt = node.alt || '';
        const label = node.getAttribute('aria-label');
        if (alt && !isCharacterInPrivateUseArea(alt)) { return alt; }
        if (label) { return `:${label}:`; }
        return '';
      }
      let text = '';
      for (const child of node.childNodes) { text += customTextContent(child); }
      return text;
    }
    return '';
  }

  /**
   * 双模解析引擎：从聊天行元素中提取结构化信息。
   * 根据当前域名自动选择精细解析（主服务器）或回落（私服）模式。
   */
  function extractUsefulData(chatLineElement, selfName, precomputedTime) {
    if (!chatLineElement || !precomputedTime) return null;

    const hostname = window.location.hostname;
    const isMainServerMode = MAIN_SERVER_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));

    if (isMainServerMode) {
      // --- 主服务器精细解析模式 ---
      const data = { time: precomputedTime, type: 'unknown', sender: 'System', receiver: 'Local', content: '' };
      const cl = chatLineElement.classList;
      if (cl.contains('chat-line-whisper-thinking')) data.type = 'whisper-think';
      else if (cl.contains('chat-line-whisper')) data.type = 'whisper';
      else if (cl.contains('chat-line-party-thinking')) data.type = 'party-think';
      else if (cl.contains('chat-line-party')) data.type = 'party';
      else if (cl.contains('chat-line-thinking')) data.type = 'think';
      else if (cl.contains('chat-line-meta-line')) data.type = 'system';
      else if (cl.contains('chat-line-announcement')) data.type = 'announcement';
      else if (cl.contains('chat-line')) data.type = 'say';

      // 通过克隆节点并移除无关部分来提取完整的消息文本，这种方法稳健且能保留上下文
      const container = chatLineElement.cloneNode(true);
      container.querySelectorAll('.chat-line-timestamp, .chat-line-lead').forEach(el => el.remove());
      data.content = customTextContent(container).replace(/\s+/g, ' ').trim();

      const nameNode = chatLineElement.querySelector('.chat-line-name');
      const nameText = nameNode ? customTextContent(nameNode).replace(/^\[|\]$/g, '').trim() : null;

      if (data.type === 'system') return data;

      if (data.type.includes('party')) {
        data.receiver = 'Party';
        if (nameText) data.sender = nameText;
      } else if (data.type.includes('whisper')) {
        // 基于完整的消息内容判断私聊方向
        if (data.content.startsWith('To ') || data.content.startsWith('Thinks to ')) {
          data.sender = selfName || 'Me (未设置)';
          data.receiver = nameText || 'Unknown';
        } else {
          data.sender = nameText || 'Unknown';
          data.receiver = selfName || 'Me (未设置)';
        }
      } else {
        data.receiver = 'Local';
        if (nameText) data.sender = nameText;
      }
      return data;

    } else {
      // --- 回落模式 (兼容私服) ---
      const rawContent = customTextContent(chatLineElement);
      if (!rawContent.trim()) return null;

      return {
        time: precomputedTime,
        is_fallback: true,
        type: '', sender: '', receiver: '',
        content: rawContent.trim()
      };
    }
  }

  /** 定位页面上的关键聊天元素。*/
  function locateChatElements() {
    return {
      tabs: document.querySelector('.chat-log-tabs'),
      chatLog: document.querySelector('.chat-log-scroll-inner'),
      chatLine: document.querySelector('.chat-line'),
      chatLogContainer: document.querySelector('.chat-log')
    };
  }

  /** 从 tabs 元素的 HTML 中解析出当前活跃的标签页名称。*/
  function findActiveTabByClass(htmlString) {
    if (!htmlString) return null;
    const container = document.createElement('div');
    container.innerHTML = htmlString;
    const activeTab = container.querySelector('a.chat-log-tab.active');
    return activeTab ? activeTab.textContent.trim() : null;
  }

  // --- 状态管理与持久化 ---
~~~~~
~~~~~javascript.new
  /*
   * =================================================================
   * 核心功能模块
   * =================================================================
   */

  // --- 状态管理与持久化 ---
~~~~~

### 下一步建议
- **功能验证**: 和之前一样，请运行 `npm run watch` 并刷新页面，确保聊天记录的捕获、解析和历史回溯功能完全正常。
- **拆分状态管理**: 验证通过后，下一步的最佳选择是提取**状态管理与持久化**相关的函数。这包括 `mergeAndDeduplicateMessages`, `loadMessagesFromStorage`, `saveMessagesToStorage` 等，我们可以将它们放入 `src/state.js` 或 `src/store.js`。

**等你完成测试后，我们就可以继续。**
