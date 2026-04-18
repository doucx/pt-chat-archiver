import { EngineStates, engineMachine } from './machine.js';
import { extractUsefulData, findActiveTabByClass, locateChatElements } from './parser.js';
import { debounce } from './utils.js';

/**
 * ChatMonitor 负责直接与游戏 DOM 交互。
 * 它封装了 MutationObserver，并提供抓取历史记录和实时监听的能力。
 */
export class ChatMonitor {
  constructor(options = {}) {
    this.onMessage = options.onMessage || (() => {});
    this.onTabChange = options.onTabChange || (() => {});
    this.getSelfName = options.getSelfName || (async () => '');
    this.getInitDebounceMs = options.getInitDebounceMs || (() => 150);

    this.messageObserver = null;
    this.tabObserver = null;
    this.currentActiveChannel = null;
    this.tabSwitchTimeout = null;
    this.lastRealtimeTimestamp = 0;
  }

  /**
   * 扫描聊天框中已存在的消息。
   */
  async getHistory() {
    const elements = locateChatElements();
    if (!elements.tabs || !elements.chatLog) return { current_tab: null, messages: [] };

    const current_tab = findActiveTabByClass(elements.tabs.innerHTML);
    const selfName = await this.getSelfName();
    const chatLines = Array.from(elements.chatLog.children);
    const currentDate = new Date();
    let lastTimeParts = null;

    const tempItems = [];

    // 1. 倒序遍历确定绝对时间
    for (let i = chatLines.length - 1; i >= 0; i--) {
      const element = chatLines[i];
      const timeNode = element.querySelector('.chat-line-timestamp');
      if (!timeNode || !timeNode.textContent.includes(':')) continue;

      const timeText = timeNode.textContent.trim();
      const [hours, minutes] = timeText.split(':').map(Number);
      if (
        lastTimeParts &&
        (hours > lastTimeParts.hours ||
          (hours === lastTimeParts.hours && minutes > lastTimeParts.minutes))
      ) {
        currentDate.setDate(currentDate.getDate() - 1);
      }
      lastTimeParts = { hours, minutes };

      const localDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')} ${timeText}`;
      const isoTimeApproximation = new Date(localDateString.replace(/-/g, '/')).toISOString();

      tempItems.unshift({ element, isoTime: isoTimeApproximation });
    }

    // 2. 正序生成消息数据
    const messages = [];
    let lastCalculatedTimestamp = 0;

    for (const item of tempItems) {
      let timestamp = new Date(item.isoTime).getTime();
      if (timestamp <= lastCalculatedTimestamp) {
        timestamp = lastCalculatedTimestamp + 1;
      }
      lastCalculatedTimestamp = timestamp;

      const adjustedIsoTime = new Date(timestamp).toISOString();
      const messageData = extractUsefulData(item.element, selfName, adjustedIsoTime);

      if (messageData?.content) {
        messageData.is_historical = true;
        messages.push(messageData);
      }
    }

    return { current_tab, messages };
  }

  /**
   * 启动实时监听。
   */
  start(onStarted) {
    const { chatLog, tabs: tabsContainer } = locateChatElements();
    if (!chatLog || !tabsContainer || this.messageObserver) return;

    engineMachine.transition(EngineStates.STARTING);

    const handleTabChange = () => {
      const newActiveTab = findActiveTabByClass(tabsContainer.innerHTML);
      if (newActiveTab && newActiveTab !== this.currentActiveChannel) {
        this.currentActiveChannel = newActiveTab;
        this.onTabChange(newActiveTab);

        engineMachine.transition(EngineStates.TAB_SWITCHING);
        clearTimeout(this.tabSwitchTimeout);

        this.tabSwitchTimeout = setTimeout(async () => {
          if (engineMachine.state === EngineStates.TAB_SWITCHING) {
            engineMachine.transition(EngineStates.RECORDING);
            if (onStarted) await onStarted();
          }
        }, 250);
      }
    };

    this.currentActiveChannel = findActiveTabByClass(tabsContainer.innerHTML);
    this.onTabChange(this.currentActiveChannel);

    this.tabObserver = new MutationObserver(handleTabChange);
    this.tabObserver.observe(tabsContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    let initNodesCount = 0;
    const MAX_HISTORY_NODES = 110;

    const finalizeInitialization = debounce(async () => {
      if (engineMachine.isStarting()) {
        engineMachine.transition(EngineStates.RECORDING);
        if (onStarted) await onStarted();
      }
    }, this.getInitDebounceMs());

    this.messageObserver = new MutationObserver((mutationsList) => {
      let hasNewNodes = false;
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          if (engineMachine.isStarting()) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE && node.matches('.chat-line')) {
                initNodesCount++;
              }
            }
          } else {
            mutation.addedNodes.forEach((node) => this._handleLiveNode(node));
          }
        }
      }
      if (engineMachine.isStarting() && hasNewNodes) {
        if (initNodesCount < MAX_HISTORY_NODES) {
          finalizeInitialization();
        }
      }
    });

    this.messageObserver.observe(chatLog, { childList: true });
    finalizeInitialization();
  }

  /**
   * 停止监听。
   */
  stop() {
    clearTimeout(this.tabSwitchTimeout);
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }
    if (this.tabObserver) {
      this.tabObserver.disconnect();
      this.tabObserver = null;
    }
    this.currentActiveChannel = null;
  }

  async _handleLiveNode(node) {
    if (!engineMachine.canProcessLiveMessage()) return;
    if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.chat-line')) return;
    if (!this.currentActiveChannel) return;

    const selfName = await this.getSelfName();

    let currentMs = Date.now();
    if (currentMs <= this.lastRealtimeTimestamp) {
      currentMs = this.lastRealtimeTimestamp + 1;
    }
    this.lastRealtimeTimestamp = currentMs;
    const preciseTime = new Date(currentMs).toISOString();

    const messageData = extractUsefulData(node, selfName, preciseTime);
    if (messageData?.content) {
      messageData.channel = this.currentActiveChannel;
      this.onMessage(messageData);
    }
  }
}
