import { MAIN_SERVER_HOSTS } from './constants.js';

/** 判断一个字符的 Unicode 码点是否位于私有使用区。*/
function isCharacterInPrivateUseArea(char) {
  if (!char) return false;
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;
  const isInPUA = codePoint >= 0xe000 && codePoint <= 0xf8ff;
  const isInSupPUA_A = codePoint >= 0xf0000 && codePoint <= 0xffffd;
  const isInSupPUA_B = codePoint >= 0x100000 && codePoint <= 0x10fffd;
  return isInPUA || isInSupPUA_A || isInSupPUA_B;
}

/** 递归地从 DOM 节点中提取可见文本，并正确处理 Emoji 图片。*/
function customTextContent(node) {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.style.display === 'none') {
      return '';
    }
    if (node.tagName === 'IMG' && node.classList.contains('pixelart')) {
      const alt = node.alt || '';
      const label = node.getAttribute('aria-label');
      if (alt && !isCharacterInPrivateUseArea(alt)) {
        return alt;
      }
      if (label) {
        return `:${label}:`;
      }
      return '';
    }
    let text = '';
    for (const child of node.childNodes) {
      text += customTextContent(child);
    }
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
  const isMainServerMode = MAIN_SERVER_HOSTS.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`),
  );

  if (isMainServerMode) {
    // --- 主服务器精细解析模式 ---
    const data = {
      time: precomputedTime,
      type: 'unknown',
      sender: 'System',
      receiver: 'Local',
      content: '',
    };
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
    for (const el of container.querySelectorAll('.chat-line-timestamp, .chat-line-lead')) {
      el.remove();
    }
    data.content = customTextContent(container).replace(/\s+/g, ' ').trim();

    const nameNode = chatLineElement.querySelector('.chat-line-name');
    const nameText = nameNode
      ? customTextContent(nameNode)
          .replace(/^\[|\]$/g, '')
          .trim()
      : null;

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
  }

  // --- 回落模式 (兼容私服) ---
  const rawContent = customTextContent(chatLineElement);
  if (!rawContent.trim()) return null;

  return {
    time: precomputedTime,
    is_fallback: true,
    type: '',
    sender: '',
    receiver: '',
    content: rawContent.trim(),
  };
}

/** 定位页面上的关键聊天元素。*/
export function locateChatElements() {
  return {
    tabs: document.querySelector('.chat-log-tabs'),
    chatLog: document.querySelector('.chat-log-scroll-inner'),
    chatLine: document.querySelector('.chat-line'),
    chatLogContainer: document.querySelector('.chat-log'),
  };
}

/** 从开始界面的 Play 按钮中提取服务器名称。*/
export function extractServerFromDOM() {
  const playButton = document.querySelector('button.btn-success');
  if (!playButton) return null;

  // 寻找按钮内的 span 元素，它通常包含服务器名称
  const serverSpan = playButton.querySelector('span');
  if (serverSpan?.textContent?.trim()) {
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
