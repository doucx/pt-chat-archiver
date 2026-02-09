import './style.css';
import { STORAGE_KEY_V5, OLD_STORAGE_KEY_V4, SELF_NAME_KEY, STORAGE_WARNING_THRESHOLD_MB, MAIN_SERVER_HOSTS } from './constants.js';
import { getStorageUsageInMB, debounce, getISOTimestamp, formatISOTimeForDisplay } from './utils.js';

(function() {
  'use strict';

  // --- 全局配置与状态 ---
  // 内存缓存，作为脚本运行期间所有聊天记录的单一数据源
  let inMemoryChatState = {};
  // 消息监听器的实例，用于跟踪其状态
  let messageObserver = null;
  // 标签页变化监听器
  let tabObserver = null;
  // 当前活跃的聊天频道名称
  let currentActiveChannel = null;
  // 状态锁：当为 true 时，表示正在处理历史消息，应暂停实时消息的捕获
  let isInitializingChat = false;
  // 状态锁：当为 true 时，表示正在切换标签页，应暂停实时消息的捕获
  let isSwitchingTabs = false;

  /**
   * 更新清理按钮的状态和文本。
   * @param {number} count - 重复项的数量。
   */
  function updateCleanButtonState(count) {
      const cleanButton = document.getElementById('log-archive-clean-button');
      if (!cleanButton) return;
  
      if (count > 0) {
          cleanButton.classList.add('active');
          cleanButton.textContent = `清理重复 (${count})`;
      } else {
          cleanButton.classList.remove('active');
          cleanButton.textContent = '清理重复';
      }
  }
  
  /*
   * =================================================================
   * 数据迁移模块
   * =================================================================
   */
  /**
   * 检查并执行一次性的数据迁移，将 v4 版本的数据转换为 v5 格式。
   * 主要处理时间戳格式的转换，并将所有旧数据标记为历史记录。
   */
  function migrateDataV4toV5() {
    const oldDataRaw = localStorage.getItem(OLD_STORAGE_KEY_V4);
    if (!oldDataRaw) return;

    console.log("检测到旧版本(v4)数据，正在执行一次性迁移...");
    try {
      const oldData = JSON.parse(oldDataRaw);
      const newData = {};

      for (const channel in oldData) {
        newData[channel] = oldData[channel].map(msg => {
          const newMsg = { ...msg };
          try {
            // v4 的时间格式 "YYYY-MM-DD HH:MM" 是本地时间，我们将其近似转换为 ISO 格式的 UTC 时间
            const localDate = new Date(msg.time.replace(/-/g, '/'));
            newMsg.time = localDate.toISOString();
          } catch (e) {
            newMsg.time = new Date().toISOString(); // 转换失败时使用当前时间作为备用
          }
          newMsg.is_historical = true;
          return newMsg;
        });
      }

      localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(newData));
      localStorage.removeItem(OLD_STORAGE_KEY_V4);
      console.log("数据迁移成功！");
    } catch (error) {
      console.error("数据迁移失败，旧数据可能已损坏，将予以保留。", error);
    }
  }

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

  /** 智能合并消息数组，用于处理聊天记录不连续的情况，例如在UI重现后。*/
  function mergeAndDeduplicateMessages(oldMessages, newMessages) {
    if (!oldMessages || oldMessages.length === 0) return newMessages;
    if (!newMessages || newMessages.length === 0) return oldMessages;
    const oldUserMessages = oldMessages.filter(msg => !msg.is_archiver);
    const newUserMessages = newMessages.filter(msg => !msg.is_archiver);
    let overlapLength = 0;
    const maxPossibleOverlap = Math.min(oldUserMessages.length, newUserMessages.length);
    for (let i = maxPossibleOverlap; i > 0; i--) {
      const suffixOfOld = oldUserMessages.slice(-i).map(msg => msg.content);
      const prefixOfNew = newUserMessages.slice(0, i).map(msg => msg.content);
      if (JSON.stringify(suffixOfOld) === JSON.stringify(prefixOfNew)) {
        overlapLength = i;
        break;
      }
    }
    let messagesToAdd;
    if (overlapLength > 0) {
      const lastOverlappingUserMessage = newUserMessages[overlapLength - 1];
      const lastOverlappingIndexInNew = newMessages.findIndex(msg => msg === lastOverlappingUserMessage);
      messagesToAdd = newMessages.slice(lastOverlappingIndexInNew + 1);
    } else {
      messagesToAdd = newMessages;
    }
    const discontinuityDetected = oldMessages.length > 0 && newMessages.length > 0 && overlapLength === 0;
    if (messagesToAdd.length === 0) return oldMessages;
    if (discontinuityDetected) {
      console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
      const discontinuityMark = {
        time: getISOTimestamp(), type: 'system', sender: 'Archiver', receiver: 'System',
        content: '[警告 - 此处可能存在记录丢失]', is_archiver: true
      };
      return oldMessages.concat([discontinuityMark], messagesToAdd);
    }
    return oldMessages.concat(messagesToAdd);
  }

  /** 扫描聊天框中已存在的消息，时间戳根据UI显示的 `HH:MM` 进行估算。*/
  function extractHistoricalChatState() {
    const elements = locateChatElements();
    if (!elements.tabs || !elements.chatLog) return { current_tab: null, messages: [] };

    const current_tab = findActiveTabByClass(elements.tabs.innerHTML);
    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const messages = [];
    const chatLines = Array.from(elements.chatLog.children);
    let currentDate = new Date();
    let lastTimeParts = null;

    for (let i = chatLines.length - 1; i >= 0; i--) {
      const element = chatLines[i];
      const timeNode = element.querySelector('.chat-line-timestamp');
      if (!timeNode || !timeNode.textContent.includes(':')) continue;

      const timeText = timeNode.textContent.trim();
      const [hours, minutes] = timeText.split(':').map(Number);
      // 处理跨天的情况
      if (lastTimeParts && (hours > lastTimeParts.hours || (hours === lastTimeParts.hours && minutes > lastTimeParts.minutes))) {
        currentDate.setDate(currentDate.getDate() - 1);
      }
      lastTimeParts = { hours, minutes };

      const localDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')} ${timeText}`;
      const isoTimeApproximation = new Date(localDateString.replace(/-/g, '/')).toISOString();

      const messageData = extractUsefulData(element, selfName, isoTimeApproximation);
      if (messageData && messageData.content) {
        messageData.is_historical = true; // 标记为历史消息
        messages.push(messageData);
      }
    }
    messages.reverse();
    return { current_tab, messages };
  }

  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   * 这是一个可被多处调用的核心同步功能。
   */
  function scanAndMergeHistory() {
    console.log("正在扫描并合并历史消息...");
    const historicalState = extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
      const channelName = historicalState.current_tab;
      const messagesScannedCount = historicalState.messages.length; // Y: 检查了的历史记录总数

      const oldMessages = inMemoryChatState[channelName] || [];
      const oldMessageCount = oldMessages.length;

      const newMergedMessages = mergeAndDeduplicateMessages(oldMessages, historicalState.messages);
      const newMessageCount = newMergedMessages.length;

      const messagesAddedCount = newMessageCount - oldMessageCount; // X: 有效合并的新记录数

      if (messagesAddedCount > 0) {
        inMemoryChatState[channelName] = newMergedMessages;
        dataChanged = true;
        const newlyAddedHistoricalMessages = newMergedMessages.slice(-messagesAddedCount);
        newlyAddedHistoricalMessages.forEach(msg => {
          // 注意：这里的 channelName 就是当时扫描时的活跃频道
          addMessageToSyntheticChannelIfNeeded(msg, channelName);
        });

        // 使用新的日志格式
        console.log(`历史扫描 [${channelName}]: 合并了 ${messagesAddedCount}/${messagesScannedCount} 条新记录。`);
      } else {
        console.log(`历史扫描 [${channelName}]: 检查了 ${messagesScannedCount} 条记录，无新增内容。`);
      }
    }

    // 如果数据有变动，且UI是打开的，则刷新UI
    if (dataChanged) {
      const uiContainer = document.getElementById('log-archive-ui-container');
      const isUIPaused = uiContainer && uiContainer.querySelector('#log-archive-pause-button').textContent.includes('▶️');
      if (uiContainer && uiContainer.style.display === 'flex' && !isUIPaused) {
        const { updateUI: uiUpdateFn } = document.getElementById('log-archive-ui-container')._uiFunctions || {};
        if (uiUpdateFn) {
          uiUpdateFn(inMemoryChatState);
        }
      }
    }
  }

  /** 从 localStorage 加载存档。*/
  function loadMessagesFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_V5)) || {};
    } catch (e) {
      console.error('读取存档失败，数据已损坏。', e); return {};
    }
  }

  /** 将内存中的存档保存到 localStorage。*/
  function saveMessagesToStorage(messagesObject) {
    console.info('存档已保存到 localStorage')
    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(messagesObject));
  }

  /**
   * (新功能) 根据条件将消息添加到合成频道。
   * 如果当前活跃频道是 'Local'，并且消息是 party 或 whisper 类型，
   * 则将其复制一份到 'Party-Local' 或 'Whisper-Local' 频道。
   * @param {object} message - 消息数据对象。
   * @param {string} activeChannel - 消息产生时所在的活跃频道。
   */
  function addMessageToSyntheticChannelIfNeeded(message, activeChannel) {
    // 核心条件：当且仅当在 'Local' 频道时才触发
    if (activeChannel !== 'Local') {
      return;
    }

    let syntheticChannelName = null;
    if (message.type.includes('party')) {
      syntheticChannelName = 'Party-Local';
    } else if (message.type.includes('whisper')) {
      syntheticChannelName = 'Whisper-Local';
    }

    // 如果是 party 或 whisper 消息，则执行添加操作
    if (syntheticChannelName) {
      if (!inMemoryChatState[syntheticChannelName]) {
        inMemoryChatState[syntheticChannelName] = [];
      }
      // 创建消息的副本以避免任何潜在的引用问题
      inMemoryChatState[syntheticChannelName].push({ ...message });
      console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
    }
  }

  // --- 【新增】数据清理模块 ---
  
      /**
       * 根据 Python 脚本的逻辑，清理一个频道记录中的重复数据。
       * @param {Array<object>} records - 一个频道的聊天记录数组。
       * @returns {{cleanedRecords: Array<object>, removedCount: number}} - 清理后的记录和被移除的记录数。
       */
      function cleanChannelRecords(records) {
          if (!records || records.length === 0) {
              return { cleanedRecords: [], removedCount: 0 };
          }
  
          const BURST_COUNT_THRESHOLD = 20;
          const BURST_TIME_THRESHOLD_MS = 1000; // 1 second
  
          const is_in_burst = new Array(records.length).fill(false);
          if (records.length >= BURST_COUNT_THRESHOLD) {
              for (let i = 0; i <= records.length - BURST_COUNT_THRESHOLD; i++) {
                  try {
                      const startTime = new Date(records[i].time).getTime();
                      const endTime = new Date(records[i + BURST_COUNT_THRESHOLD - 1].time).getTime();
                      if (isNaN(startTime) || isNaN(endTime)) continue;
  
                      if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
                          for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
                              is_in_burst[j] = true;
                          }
                      }
                  } catch (e) { continue; }
              }
          }
  
          const cleanedRecords = [];
          const seen_contents = new Set();
          let removedCount = 0;
  
          for (let i = 0; i < records.length; i++) {
              const record = records[i];
              const content = record.content;
              const has_no_historical_flag = !record.is_historical;
              const is_duplicate = content != null && seen_contents.has(content);
              const in_burst = is_in_burst[i];
              const should_delete = has_no_historical_flag && is_duplicate && in_burst;
  
              if (!should_delete) {
                  cleanedRecords.push(record);
              } else {
                  removedCount++;
              }
  
              if (content != null) {
                  seen_contents.add(content);
              }
          }
          return { cleanedRecords, removedCount };
      }
  
      /**
       * 检测所有频道中可被清理的重复记录总数。
       * @param {object} messagesByChannel - 包含所有频道消息的对象。
       * @returns {number} - 可被清理的记录总数。
       */
      function detectTotalDuplicates(messagesByChannel) {
          let totalDuplicates = 0;
          if (!messagesByChannel) return 0;
  
          for (const channel in messagesByChannel) {
              const records = messagesByChannel[channel];
              if (!records || records.length === 0) continue;
  
              const BURST_COUNT_THRESHOLD = 20;
              const BURST_TIME_THRESHOLD_MS = 1000;
  
              const is_in_burst = new Array(records.length).fill(false);
              if (records.length >= BURST_COUNT_THRESHOLD) {
                  for (let i = 0; i <= records.length - BURST_COUNT_THRESHOLD; i++) {
                      try {
                          const startTime = new Date(records[i].time).getTime();
                          const endTime = new Date(records[i + BURST_COUNT_THRESHOLD - 1].time).getTime();
                          if (isNaN(startTime) || isNaN(endTime)) continue;
                          if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
                              for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
                                  is_in_burst[j] = true;
                              }
                          }
                      } catch (e) { continue; }
                  }
              }
  
              const seen_contents = new Set();
              for (let i = 0; i < records.length; i++) {
                  const record = records[i];
                  const content = record.content;
                  const has_no_historical_flag = !record.is_historical;
                  const is_duplicate = content != null && seen_contents.has(content);
                  const in_burst = is_in_burst[i];
  
                  if (has_no_historical_flag && is_duplicate && in_burst) {
                      totalDuplicates++;
                  }
  
                  if (content != null) {
                      seen_contents.add(content);
                  }
              }
          }
          return totalDuplicates;
      }
  
  
      /*
   * =================================================================
   * 用户交互界面 (UI) 模块
   * =================================================================
   */  function createUI() {
    let isUIPaused = false;

    const container = document.createElement('div');
    container.id = 'log-archive-ui-container';
    container.innerHTML = `
            <div id="log-archive-ui-header">
                <h2>聊天记录存档 v5.5.0</h2>
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

    const uiContainer = document.getElementById('log-archive-ui-container');
    const channelSelector = document.getElementById('log-archive-channel-selector');
    const logDisplay = document.getElementById('log-archive-ui-log-display');
    const copyButton = document.getElementById('log-archive-copy-button');
    const copyAllButton = document.getElementById('log-archive-copy-all-button');
    const clearButton = document.getElementById('log-archive-clear-button');
    const closeButton = document.getElementById('log-archive-close-button');
    const refreshButton = document.getElementById('log-archive-refresh-button');
    const selfNameInput = document.getElementById('log-archive-self-name-input');
    const downloadButton = document.getElementById('log-archive-download-button');
    const statsButton = document.getElementById('log-archive-stats-button');
    const pauseButton = document.getElementById('log-archive-pause-button');
    const cleanButton = document.getElementById('log-archive-clean-button');

    let isStatsViewActive = false;

    selfNameInput.value = localStorage.getItem(SELF_NAME_KEY) || '';
    selfNameInput.addEventListener('change', () => {
      localStorage.setItem(SELF_NAME_KEY, selfNameInput.value.trim());
    });

    cleanButton.addEventListener('click', () => {
        const duplicateCount = detectTotalDuplicates(inMemoryChatState);
        if (duplicateCount === 0) {
            alert('未发现可清理的重复记录。');
            return;
        }

        if (confirm(`【确认】此操作将根据特定规则删除 ${duplicateCount} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`)) {
            console.log('正在清理重复记录...');
            let totalRemoved = 0;

            const cleanedData = {};
            for (const channel in inMemoryChatState) {
                const { cleanedRecords, removedCount } = cleanChannelRecords(inMemoryChatState[channel]);
                cleanedData[channel] = cleanedRecords;
                if (removedCount > 0) {
                    totalRemoved += removedCount;
                    console.log(`频道 [${channel}]: 移除了 ${removedCount} 条记录。`);
                }
            }
            inMemoryChatState = cleanedData;

            if (totalRemoved > 0) {
                saveMessagesToStorage(inMemoryChatState);
                updateUI(inMemoryChatState);
                console.log(`清理完成，共移除了 ${totalRemoved} 条记录。`);

                updateCleanButtonState(0);

                cleanButton.textContent = '清理完毕!';
                setTimeout(() => {
                    if (cleanButton.textContent === '清理完毕!') {
                       updateCleanButtonState(0);
                    }
                }, 2000);
            }
        }
    });

    /**
     * 一个辅助函数，用于更新 textarea 的内容同时保留用户的选择或光标位置。
     * @param {function} updateFn - 一个无参数的函数，其作用是修改 logDisplay.value 的值。
     */
    function updateTextareaAndPreserveSelection(updateFn) {
      // 只有当用户正在与文本框交互时，保留选区才有意义。
      const isFocused = document.activeElement === logDisplay;
      let selectionStart, selectionEnd;

      if (isFocused) {
        selectionStart = logDisplay.selectionStart;
        selectionEnd = logDisplay.selectionEnd;
      }

      // 执行实际的 UI 更新
      updateFn();

      if (isFocused) {
        // 恢复之前的选区或光标位置
        logDisplay.setSelectionRange(selectionStart, selectionEnd);
      }
    }

    // --- 数据统计与格式化 ---

    function calculateTopTalkers(messages) {
      const counts = new Map();
      let totalMessagesInPeriod = 0;
      messages.forEach(msg => {
        if (msg.sender && msg.sender !== 'System') {
          counts.set(msg.sender, (counts.get(msg.sender) || 0) + 1);
          totalMessagesInPeriod++;
        }
      });
      const data = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      return { data, total: totalMessagesInPeriod };
    }

    function calculateHourlyActivity(messages) {
      const hourlyCounts = new Array(24).fill(0);
      let totalMessagesInPeriod = 0;
      messages.forEach(msg => {
        try {
          // 关键修改：从 getUTCHours() 改为 getHours()，以使用用户本地时区进行统计。
          const hour = new Date(msg.time).getHours();
          hourlyCounts[hour]++;
          totalMessagesInPeriod++;
        } catch (e) { /* 忽略无效时间 */ }
      });
      const data = hourlyCounts.map((count, hour) => ({ hour, count }))
        .filter(item => item.count > 0)
        .sort((a, b) => b.count - a.count);
      return { data, total: totalMessagesInPeriod };
    }

    function formatTopTalkers(results) {
      const { data, total } = results;
      let text = '\n\n===== 最活跃用户 (TOP 10) =====\n\n';
      if (data.length === 0 || total === 0) return text + '无用户发言记录。';
      return text + data.slice(0, 10).map(item => {
        const percentage = (item.count / total * 100).toFixed(1);
        return `${item.name.padEnd(20, ' ')} | ${item.count} 条消息 (${percentage}%)`;
      }).join('\n');
    }

    function formatHourlyActivity(results) {
      const { data, total } = results;
      let text = '\n\n===== 聊天峰值时间段 =====\n\n';
      if (data.length === 0 || total === 0) return text + '无有效时间记录。';
      return text + data.map(item => {
        const hourStr = String(item.hour).padStart(2, '0');
        const nextHourStr = String((item.hour + 1) % 24).padStart(2, '0');
        const percentage = (item.count / total * 100).toFixed(1);
        return `${hourStr}:00 - ${nextHourStr}:00 `.padEnd(16, ' ') + `| ${item.count} 条消息 (${percentage}%)`;
      }).join('\n');
    }

    function generateStatisticsText(messages, channelName) {
      if (!messages || messages.length === 0) {
        return `--- 在频道 [${channelName}] 中没有记录可供统计 ---`;
      }
      const filteredMessages = messages.filter(msg => !msg.is_fallback && !msg.is_archiver);
      if (filteredMessages.length === 0) {
        return `--- 在频道 [${channelName}] 中没有可供精细统计的用户消息 (可能均为私服记录) ---`;
      }
      let output = `--- [${channelName}] 频道统计报告 (分析 ${filteredMessages.length} 条消息) ---\n`;
      output += formatTopTalkers(calculateTopTalkers(filteredMessages));
      output += formatHourlyActivity(calculateHourlyActivity(filteredMessages));
      return output;
    }

    // --- UI 渲染与更新 ---

    /** 格式化单条消息以在 UI 中显示。*/
    function formatMessageForDisplay(msg) {
      let prefix = '';
      if (msg.type.includes('party')) prefix = '👥 ';
      else if (msg.type.includes('whisper')) prefix = '💬 ';
      else if (msg.type.includes('announcement')) prefix = '📣 ';
      const displayTime = formatISOTimeForDisplay(msg.time);
      return `${displayTime} ${prefix}${msg.content}`;
    }

    function displayChatLog(messages, channelName) {
      updateTextareaAndPreserveSelection(() => {
        if (messages && messages.length > 0) {
          logDisplay.value = messages.map(formatMessageForDisplay).join('\n');
        } else {
          logDisplay.value = `--- 在频道 [${channelName}] 中没有记录 ---`;
        }
      });
    }

    function displayStatistics(messages, channelName) {
      updateTextareaAndPreserveSelection(() => {
        logDisplay.value = generateStatisticsText(messages, channelName);
      });
    }

    function renderCurrentView(messagesByChannel) {
      // const allMessages = loadMessagesFromStorage();
      const selectedChannel = channelSelector.value;
      const messages = messagesByChannel[selectedChannel] || [];
      if (isStatsViewActive) {
        displayStatistics(messages, selectedChannel);
      } else {
        displayChatLog(messages, selectedChannel);
      }
    }

    function updateUI(messagesByChannel) {
      // console.log("UI updated")
      const previouslySelected = channelSelector.value;
      // const messagesByChannel = loadMessagesFromStorage();
      const channels = Object.keys(messagesByChannel);
      channelSelector.innerHTML = '';

      if (channels.length === 0) {
        channelSelector.innerHTML = '<option>无记录</option>';
      } else {
        channels.forEach(channel => {
          const option = document.createElement('option');
          option.value = channel;
          option.textContent = `${channel} (${messagesByChannel[channel].length})`;
          channelSelector.appendChild(option);
        });
        channelSelector.value = previouslySelected && channels.includes(previouslySelected) ? previouslySelected : channels[0];
      }
      renderCurrentView(messagesByChannel);
    }

    // --- 事件绑定 ---
    toggleButton.addEventListener('click', () => {
      const isVisible = uiContainer.style.display === 'flex';
      if (!isVisible) {
        updateUI(inMemoryChatState);
      }
      uiContainer.style.display = isVisible ? 'none' : 'flex';
    });

    closeButton.addEventListener('click', () => { uiContainer.style.display = 'none'; });
    channelSelector.addEventListener('change', () => renderCurrentView(inMemoryChatState));

    refreshButton.addEventListener('click', () => {
      if (isInitializingChat) {
        console.log("正在初始化，请稍后刷新...");
        return;
      }
      console.log("执行强制刷新...");
      scanAndMergeHistory();
      saveMessagesToStorage(inMemoryChatState);
      updateUI(inMemoryChatState);
      console.log("强制刷新完成。");
    });

// --- 【新增】当用户在显示区域按下鼠标时，自动暂停UI刷新 ---
    logDisplay.addEventListener('mousedown', () => {
        // 如果UI当前没有被暂停，则自动触发暂停
        if (!isUIPaused) {
            isUIPaused = true;
            pauseButton.textContent = '▶️ ';
            // 确保样式也同步更新
            pauseButton.classList.add('paused');
            console.log("UI 自动刷新因用户交互而暂停。");
        }
    });

    pauseButton.addEventListener('click', () => {
      isUIPaused = !isUIPaused; // 切换暂停状态
      pauseButton.classList.toggle('paused', isUIPaused);
      if (isUIPaused) {
        pauseButton.textContent = '▶️ ';
        console.log("UI 自动刷新已暂停。");
      } else {
        pauseButton.textContent = '⏸️ ';
        console.log("UI 自动刷新已恢复，正在更新至最新状态...");
        updateUI(inMemoryChatState); // 恢复时，立即执行一次刷新
      }
    });

    statsButton.addEventListener('click', () => {
      isStatsViewActive = !isStatsViewActive;
      statsButton.classList.toggle('active', isStatsViewActive);
      statsButton.textContent = isStatsViewActive ? '查看记录' : '查看统计';
      renderCurrentView(inMemoryChatState);
    });

    copyButton.addEventListener('click', () => {
      if (logDisplay.value) {
        navigator.clipboard.writeText(logDisplay.value).then(() => {
          console.log('当前显示内容已复制到剪贴板。');
          const originalText = copyButton.textContent;
          copyButton.textContent = '已复制!';
          setTimeout(() => copyButton.textContent = originalText, 1500);
        }).catch(err => {
          console.error('复制失败:', err);
          alert('复制失败，请手动复制。');
        });
      }
    });

    copyAllButton.addEventListener('click', () => {
      scanAndMergeHistory();
      saveMessagesToStorage(inMemoryChatState);
      updateUI(inMemoryChatState);
      const messages = JSON.stringify(inMemoryChatState, null, 2);
      navigator.clipboard.writeText(messages).then(() => {
        console.log('所有频道的记录 (JSON格式) 已复制到剪贴板。');
        const originalText = copyAllButton.textContent;
        copyAllButton.textContent = '已复制!';
        setTimeout(() => copyAllButton.textContent = originalText, 1500);
      }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制。');
      });
    });

    clearButton.addEventListener('click', () => {
      // 更新确认对话框的文本，使其更准确地描述操作效果。
      // 这不是一个“清空”，而是一个“重置”。
      if (confirm('【警告】此操作将清空所有本地存档，并以当前屏幕上可见的聊天记录作为新的起点。确定要重置吗？')) {
        console.log('正在执行存档重置...');

        // 步骤 1: 暂停消息监听，防止在重置过程中产生数据竞争。
        deactivateLogger();

        // 步骤 2: 清空后端存储和当前内存状态。
        localStorage.removeItem(STORAGE_KEY_V5);
        inMemoryChatState = {};

        // 步骤 3: 立即重新扫描屏幕上的“幽灵消息”，将其作为新的存档基础。
        // 这一步确保了我们的内存状态与用户所见的屏幕内容同步。
        scanAndMergeHistory();

        // 步骤 4: 立即将这个新的状态保存，完成重置。
        saveMessagesToStorage(inMemoryChatState);

        // 步骤 5: 重置并更新 UI 界面。
        isStatsViewActive = false;
        statsButton.classList.remove('active');
        statsButton.textContent = '查看统计';
        updateUI(inMemoryChatState);

        console.log('存档已重置为当前屏幕所见内容。');
        // 注意：消息监听器将由主循环的 uiObserver 在下一次检查时自动重新激活（如果聊天窗口可见）。
        // 这种方式更稳健，能适应各种边缘情况，例如用户在确认期间关闭了聊天窗口。
      }
    });

    downloadButton.addEventListener('click', () => {
      const allMessages = loadMessagesFromStorage();
      if (Object.keys(allMessages).length === 0) {
        alert('没有可供下载的记录。'); return;
      }
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const baseFilename = `pt-saver-${timestamp}`;
      let allTextContent = '';
      for (const channelName in allMessages) {
        allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
        allTextContent += allMessages[channelName].map(formatMessageForDisplay).join('\n');
      }
      function triggerDownload(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      triggerDownload(JSON.stringify(allMessages, null, 2), `${baseFilename}.json`, 'application/json');
      triggerDownload(allTextContent.trim(), `${baseFilename}.txt`, 'text/plain');
      console.log(`已触发下载：${baseFilename}.json 和 ${baseFilename}.txt`);
    });

    container._uiFunctions = { updateUI: updateUI };

    // 检查存储空间并更新UI警告的函数
    function checkStorageUsage() {
      const usageMB = getStorageUsageInMB();
      const uiHeader = document.getElementById('log-archive-ui-header');
      let warningElement = document.getElementById('log-archive-storage-warning');

      // console.log(`当前存储占用: ${usageMB.toFixed(2)} MB`); // 用于调试，可以取消注释

      if (usageMB > STORAGE_WARNING_THRESHOLD_MB) {
        if (!warningElement) {
          warningElement = document.createElement('div');
          warningElement.id = 'log-archive-storage-warning';
          // 将警告信息添加到标题和控制按钮之间
          const controls = document.getElementById('log-archive-ui-controls');
          uiHeader.insertBefore(warningElement, controls);
        }
        warningElement.textContent = `⚠️ 存储占用过高 (${usageMB.toFixed(1)}MB)，请及时下载或清空！`;
      } else {
        if (warningElement) {
          warningElement.remove();
        }
      }
    }


    return { updateUI, checkStorageUsage };
  }

  /*
   * =================================================================
   * 脚本主程序与生命周期管理
   * =================================================================
   */

  /** 处理 MutationObserver 捕获到的新消息节点。*/
  function handleNewChatMessage(node) {
    // 同时检查初始化锁和标签页切换锁
    if (isInitializingChat || isSwitchingTabs) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;

    // 直接使用已缓存的当前频道，不再查询DOM
    if (!currentActiveChannel) return;

    const selfName = localStorage.getItem(SELF_NAME_KEY) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData && messageData.content) {
      if (!inMemoryChatState[currentActiveChannel]) {
        inMemoryChatState[currentActiveChannel] = [];
      }
      inMemoryChatState[currentActiveChannel].push(messageData);
      addMessageToSyntheticChannelIfNeeded(messageData, currentActiveChannel);
    }

    const uiContainer = document.getElementById('log-archive-ui-container');
    const isUIPaused = uiContainer && uiContainer.querySelector('#log-archive-pause-button').textContent.includes('▶️');
    if (uiContainer && uiContainer.style.display === 'flex' && !isUIPaused) {
      const { updateUI: uiUpdateFn } = document.getElementById('log-archive-ui-container')._uiFunctions || {};
      if (uiUpdateFn) {
        uiUpdateFn(inMemoryChatState);
      }
    }
  }

  /**
   * 激活聊天记录器。在聊天UI出现时调用。
   * 包含防抖逻辑以正确处理历史消息的批量加载。
   */
  function activateLogger() {
    const { chatLog, tabs: tabsContainer } = locateChatElements();
    if (!chatLog || !tabsContainer || messageObserver) return;

    console.log("正在激活聊天记录器...");
    isInitializingChat = true;

    // --- 设置标签页切换监听器 ---
    const handleTabChange = () => {
      const newActiveTab = findActiveTabByClass(tabsContainer.innerHTML);
      if (newActiveTab && newActiveTab !== currentActiveChannel) {
        console.log(`标签页已切换: 从 [${currentActiveChannel}] -> [${newActiveTab}]`);
        currentActiveChannel = newActiveTab;

        // 1. 设置切换锁，立即屏蔽新消息记录
        isSwitchingTabs = true;

        // 2. 等待 DOM 渲染完成
        setTimeout(() => {
          console.log("标签页 DOM 已更新，开始扫描并合并历史记录...");

          // 3. 【核心改动】执行历史记录的扫描与合并
          scanAndMergeHistory();

          // 4. (可选优化) 如果 UI 窗口是打开的，自动切换到新频道并刷新
          // const uiContainer = document.getElementById('log-archive-ui-container');
          // if (uiContainer && uiContainer.style.display === 'flex') {
          //     const channelSelector = document.getElementById('log-archive-channel-selector');
          //     channelSelector.value = newActiveTab; // 自动选中新频道
          //     const { updateUI: uiUpdateFn } = uiContainer._uiFunctions || {};
          //     if (uiUpdateFn) {
          //         uiUpdateFn(inMemoryChatState); // 刷新整个UI
          //     }
          // }

          // 5. 解除锁定，允许记录实时消息
          isSwitchingTabs = false;
          console.log("标签页切换流程完成，已解除记录锁定。");
        }, 250); // 稍微增加延迟以确保 DOM 完全稳定
      }
    };

    // 立即确定初始的活动标签页
    currentActiveChannel = findActiveTabByClass(tabsContainer.innerHTML);
    console.log(`初始活动标签页为 [${currentActiveChannel}]`);

    tabObserver = new MutationObserver(handleTabChange);
    // 监视整个标签容器的子节点和属性变化，以捕获 a.active 的 class 变更
    tabObserver.observe(tabsContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    // --- 2. 设置消息监听器 (旧逻辑稍作调整) ---
    const finalizeInitialization = debounce(() => {
      console.log("历史消息加载稳定，开始扫描并合并...");
      scanAndMergeHistory();
      isInitializingChat = false;
      console.log("实时消息监听器已完全激活。");
    }, 500);

    messageObserver = new MutationObserver((mutationsList) => {
      let hasNewNodes = false;
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          if (!isInitializingChat) {
            mutation.addedNodes.forEach(handleNewChatMessage);
          }
        }
      }
      if (isInitializingChat && hasNewNodes) {
        finalizeInitialization();
      }
    });

    messageObserver.observe(chatLog, { childList: true });
    finalizeInitialization();
  }

  /** 停用并清理聊天记录器，在聊天UI消失时调用。*/
  function deactivateLogger() {
    if (messageObserver) {
      messageObserver.disconnect();
      messageObserver = null;
    }
    // 新增：同时停用标签页监听器
    if (tabObserver) {
      tabObserver.disconnect();
      tabObserver = null;
    }
    isInitializingChat = false;
    isSwitchingTabs = false; // 确保锁被重置
    currentActiveChannel = null; // 重置当前频道
    console.log("所有监听器已停用。");
  }

  /** 脚本主入口函数。*/
  function main() {
    migrateDataV4toV5();
    inMemoryChatState = loadMessagesFromStorage();
    const { updateUI, checkStorageUsage } = createUI();

    console.log("PonyTown 聊天记录存档器 v5.5.0 正在等待游戏界面加载...");

    checkStorageUsage();
    // 监视整个页面，以检测聊天UI的出现和消失
    const uiObserver = new MutationObserver(() => {
      // 我们需要检查 .chat-log 容器，因为 style 属性在它上面
      const { chatLogContainer } = locateChatElements();

      if (chatLogContainer) {
        // 核心逻辑：检查容器的 display 样式是否为 'none'
        const isVisible = chatLogContainer.style.display !== 'none';

        if (isVisible && !messageObserver) {
          activateLogger();
        } else if (!isVisible && messageObserver) {
          deactivateLogger();
        }
      } else if (messageObserver) {
        // 作为保险措施，如果容器真的从DOM中移除了，也停用记录器
        deactivateLogger();
      }
    });

    uiObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    // 周期性地将内存状态持久化到 localStorage
    setInterval(() => {
      saveMessagesToStorage(inMemoryChatState);
      checkStorageUsage();
    }, 15000);

    // 【新增】周期性地检测重复项并更新UI
    let lastCheckedState = '';
    let lastDuplicateCount = -1; // 使用-1来强制在第一次启动时进行检查
    setInterval(() => {
        const currentState = JSON.stringify(inMemoryChatState);
        if (currentState !== lastCheckedState) {
            // console.log("数据已变更，正在重新检测重复项..."); // 这条日志太频繁，注释掉
            lastCheckedState = currentState;
            const duplicateCount = detectTotalDuplicates(inMemoryChatState);

            if (duplicateCount !== lastDuplicateCount) {
                updateCleanButtonState(duplicateCount);
                lastDuplicateCount = duplicateCount;
            }
        }
    }, 5000); // 每5秒检查一次

    // 确保在页面关闭前执行最后一次保存
    window.addEventListener('pagehide', () => {
      console.log('页面即将关闭，正在执行最终存档...');
      saveMessagesToStorage(inMemoryChatState);
    });
  }

  if (document.readyState === 'complete') {
    main();
  } else {
    window.addEventListener('load', main);
  }
})();
