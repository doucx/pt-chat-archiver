import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatMonitor } from '../src/monitor.js';
import { engineMachine, EngineStates } from '../src/machine.js';
import * as parser from '../src/parser.js';

// Mock Parser 模块的所有导出
vi.mock('../src/parser.js', () => ({
  findActiveTabByClass: vi.fn(),
  locateChatElements: vi.fn(),
  extractUsefulData: vi.fn(),
}));

describe('ChatMonitor (DOM Monitoring Logic)', () => {
  let monitor;
  let mockCallbacks;
  let chatLog;
  let tabsContainer;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    engineMachine.reset();

    // 1. 构造 Mock DOM 环境
    tabsContainer = document.createElement('div');
    tabsContainer.className = 'chat-log-tabs-container';
    tabsContainer.innerHTML = '<a class="active">Local</a><a>Party</a>';
    
    chatLog = document.createElement('div');
    chatLog.className = 'chat-log-scroll-inner';
    
    document.body.appendChild(tabsContainer);
    document.body.appendChild(chatLog);

    // 2. 预设 Parser 返回值
    parser.locateChatElements.mockReturnValue({
      tabs: tabsContainer,
      chatLog: chatLog,
    });
    parser.findActiveTabByClass.mockReturnValue('Local');

    // 3. 构造 Monitor 实例
    mockCallbacks = {
      onMessage: vi.fn(),
      onTabChange: vi.fn(),
      getSelfName: vi.fn(() => Promise.resolve('Me')),
      getInitDebounceMs: vi.fn(() => 10), // 使用极短的防抖时间以加速测试
    };

    monitor = new ChatMonitor(mockCallbacks);
  });

  describe('Lifecycle & State Transitions', () => {
    it('start() 应当正确流转状态机', async () => {
      monitor.start();
      expect(engineMachine.state).toBe(EngineStates.STARTING);
      expect(mockCallbacks.onTabChange).toHaveBeenCalledWith('Local');

      // 等待防抖结束
      await new Promise(r => setTimeout(r, 20));
      expect(engineMachine.isRecording()).toBe(true);
    });

    it('stop() 应当重置状态机并断开观察者', () => {
      monitor.start();
      monitor.stop();
      engineMachine.reset();
      expect(engineMachine.isStopped()).toBe(true);
      expect(monitor.messageObserver).toBeNull();
    });
  });

  describe('Historical Scan (getHistory)', () => {
    it('应当能从 DOM 节点中正确提取历史消息', async () => {
      // 模拟 3 条带有时间戳的消息节点
      chatLog.innerHTML = `
        <div class="chat-line"><span class="chat-line-timestamp">10:00</span></div>
        <div class="chat-line"><span class="chat-line-timestamp">10:01</span></div>
      `;

      parser.extractUsefulData.mockImplementation((el, name, time) => ({
        content: 'msg',
        time
      }));

      const { current_tab, messages } = await monitor.getHistory();

      expect(current_tab).toBe('Local');
      expect(messages.length).toBe(2);
      expect(messages[0].is_historical).toBe(true);
    });
  });

  describe('Real-time Monitoring', () => {
    it('监听到新节点时应当触发 onMessage 回调', async () => {
      monitor.start();
      // 等待进入 RECORDING 状态
      await new Promise(r => setTimeout(r, 20));

      parser.extractUsefulData.mockReturnValue({ content: 'New Live Message' });

      // 模拟 DOM 插入
      const newNode = document.createElement('div');
      newNode.className = 'chat-line';
      chatLog.appendChild(newNode);

      // MutationObserver 是异步的，我们需要稍微等待
      await vi.waitFor(() => {
        expect(mockCallbacks.onMessage).toHaveBeenCalled();
        const calledData = mockCallbacks.onMessage.mock.calls[0][0];
        expect(calledData.content).toBe('New Live Message');
        expect(calledData.channel).toBe('Local');
      });
    });

    it('在 STARTING 状态下不应触发实时消息回调（避免重复录入历史记录）', async () => {
      monitor.start();
      expect(engineMachine.isStarting()).toBe(true);

      const newNode = document.createElement('div');
      newNode.className = 'chat-line';
      chatLog.appendChild(newNode);

      // 给一点时间，确保 MutationObserver 运行了但被拦截
      await new Promise(r => setTimeout(r, 5));
      expect(mockCallbacks.onMessage).not.toHaveBeenCalled();
    });
  });

  describe('Tab Switching', () => {
    it('检测到频道切换时应当进入 TAB_SWITCHING 状态并触发回调', async () => {
      monitor.start();
      await new Promise(r => setTimeout(r, 20)); // 进入 RECORDING

      // 模拟频道切换：修改 tabsContainer 内部并改变 Parser 返回值
      parser.findActiveTabByClass.mockReturnValue('Party');
      
      // 触发 MutationObserver (属性变更)
      tabsContainer.querySelector('.active').classList.remove('active');
      tabsContainer.querySelectorAll('a')[1].classList.add('active');

      await vi.waitFor(() => {
        expect(mockCallbacks.onTabChange).toHaveBeenCalledWith('Party');
        expect(engineMachine.isTabSwitching()).toBe(true);
      });

      // 等待 250ms 的切换防抖结算
      await new Promise(r => setTimeout(r, 300));
      expect(engineMachine.isRecording()).toBe(true);
    });
  });
});