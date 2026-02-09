import './style.css';
import { STORAGE_KEY_V5, OLD_STORAGE_KEY_V4, SELF_NAME_KEY, STORAGE_WARNING_THRESHOLD_MB } from './constants.js';
import { getStorageUsageInMB, debounce, getISOTimestamp, formatISOTimeForDisplay } from './utils.js';
import { extractUsefulData, locateChatElements, findActiveTabByClass } from './parser.js';
import { migrateDataV4toV5, mergeAndDeduplicateMessages, loadMessagesFromStorage, saveMessagesToStorage, addMessageToSyntheticChannelIfNeeded, cleanChannelRecords, detectTotalDuplicates } from './state.js';

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
   * 核心功能模块
   * =================================================================
   */

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
          addMessageToSyntheticChannelIfNeeded(inMemoryChatState, msg, channelName);
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
      addMessageToSyntheticChannelIfNeeded(inMemoryChatState, messageData, currentActiveChannel);
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
