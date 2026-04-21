import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
import {
  currentPage,
  isLockedToBottom,
  loadingMessage,
  viewMode,
} from '../src/ui/store/uiStore.js';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';

const mockCallbacks = {
  scanAndMergeHistory: vi.fn(() => Promise.resolve()),
  saveMessagesToStorage: vi.fn(() => Promise.resolve()),
  scanAllDuplicatesAsync: vi.fn(async () => []),
  deleteMessages: vi.fn(async () => {}),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(() => Promise.resolve()),
  onAutoSaveIntervalChange: vi.fn(),
};

const createMockAdapter = (state) => ({
  getServers: async () => Object.keys(state),
  getChannels: async (server) => Object.keys(state[server] || {}),
  getChannelCount: async (server, channel) => (state[server]?.[channel] || []).length,
  getMessages: async (server, channel, page, pageSize, onProgress, offsetOverride) => {
    const list = state[server]?.[channel] || [];
    const start = offsetOverride !== undefined ? offsetOverride : (page - 1) * pageSize;

    // 如果是请求统计数据，模拟进度回调
    if (onProgress) {
      onProgress(Math.floor(pageSize / 2), pageSize);
      // 检查是否有挂起的 promise 可以用来模拟延迟
      if (global.__test_delay_promise) {
        await global.__test_delay_promise;
      }
    }

    return {
      messages: list.slice(start, start + pageSize),
      total: list.length,
    };
  },
  getMessagesChunk: async (server, channel, lastTime, limit) => {
    const list = state[server]?.[channel] || [];
    let startIndex = 0;
    if (lastTime) {
      startIndex = list.findIndex((m) => m.time > lastTime);
      if (startIndex === -1) return [];
    }
    return list.slice(startIndex, startIndex + limit);
  },
  getAllData: async () => state,
});

async function renderUI(initialState) {
  document.body.innerHTML = '';
  const adapter = createMockAdapter(initialState);
  const ui = await createUI(adapter, mockCallbacks);
  await ui.updateRecordingStatus('Test Server', 'Local');

  const toggleBtn = document.getElementById('log-archive-ui-toggle-button');
  if (toggleBtn) fireEvent.click(toggleBtn);

  return ui;
}

describe('UI Integration Smoke Tests', () => {
  let mockAppState;
  let activeUI = null;

  afterEach(() => {
    if (activeUI) {
      activeUI.destroy();
      activeUI = null;
    }
  });

  beforeEach(async () => {
    localStorage.clear();
    await storageManager.init();
    
    // 强制重置所有模块级 Signal 的初值，防止跨测试污染
    viewMode.value = 'log';
    currentPage.value = 1;
    isLockedToBottom.value = false;
    pageSize.value = 1000;
    statsLimit.value = 5000;
    loadingMessage.value = '';

    mockAppState = {
      'Test Server': {
        Local: Array.from({ length: 250 }, (_, i) => ({
          time: new Date().toISOString(),
          content: `Message ${i + 1}`,
          type: 'say',
        })),
        Party: [{ time: new Date().toISOString(), content: 'Party Message', type: 'party' }],
      },
    };
    vi.clearAllMocks();
  });

  it('初始加载时应正确渲染数据和默认频道', async () => {
    activeUI = await renderUI(mockAppState);

    // 虽然 renderUI 内部已经 await refreshView，但在复杂的测试环境中
    // 配合 waitFor 是一种更稳健的实践
    await waitFor(() => {
      const channelSelector = screen.getByRole('combobox');
      expect(channelSelector.value).toBe('Local');
    });

    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 1');
  });

  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    activeUI = await renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');

    // 初始状态 (ConfigPanel 未挂载)
    expect(document.getElementById('log-archive-log-view')).toBeVisible();
    expect(document.getElementById('log-archive-config-view')).toBeNull();

    // 点击设置 (触发异步刷新)
    fireEvent.click(settingsButton);

    // 必须使用 waitFor 等待异步 DOM 变更
    await waitFor(() => {
      expect(document.getElementById('log-archive-log-view')).toBeNull();
      expect(document.getElementById('log-archive-config-view')).toBeVisible();
    });

    // 再次点击切回
    fireEvent.click(settingsButton);
    await waitFor(() => {
      expect(document.getElementById('log-archive-log-view')).toBeVisible();
    });
  });

  it('在设置中修改分页大小应能实时改变日志显示条数', async () => {
    activeUI = await renderUI(mockAppState);

    // 1. 进入设置
    fireEvent.click(screen.getByTitle('设置'));

    // 2. 找到分页大小输入框并改为 50 (等待渲染完成)
    const pageSizeInput = await screen.findByLabelText(/分页大小/);
    fireEvent.change(pageSizeInput, { target: { value: '50' } });

    // 3. 等待异步设置完成并切回日志视图
    await waitFor(() => {
      fireEvent.click(screen.getByTitle('设置'));
    });

    // 4. 验证分页总数变为 5 (250 / 50)
    await waitFor(() => {
      expect(screen.getByText('1 / 5')).toBeInTheDocument();
    });

    // 5. 验证内容只显示到第 50 条
    await waitFor(() => {
      const logDisplay = screen.getByRole('textbox');
      expect(logDisplay.value).toContain('Message 50');
      expect(logDisplay.value).not.toContain('Message 51');
    });
  });

  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
    activeUI = await renderUI(mockAppState);
    const lastBtn = screen.getByTitle('跳转并锁定到末尾');
    const logDisplay = screen.getByRole('textbox');

    // 1. 点击末页进入锁定模式
    fireEvent.click(lastBtn);
    // 使用 waitFor 确保即使渲染循环有微小延迟也能通过
    await waitFor(() => expect(lastBtn).toHaveClass('active'));

    // 2. 模拟加载中状态（refreshView 异步流启动）
    // 直接操作 value 模拟 renderer 的中间态
    logDisplay.value = '⏳ 数据加载与处理中...';

    // 模拟由内容变短引起的滚动事件
    // 在锁定状态下，如果 isAtBottom 为假（此时内容只有一行，自然为假），且没有加载保护，会触发解锁
    fireEvent.scroll(logDisplay);

    // 3. 验证：由于加载保护存在，锁定状态不应被移除
    await waitFor(() => {
      expect(lastBtn).toHaveClass('active');
    });

    // 4. 等待后台真实的 refreshView 完成
    // 必须确保 loadingMessage 被清空，否则后续真实的 scroll 会被拦截
    await waitFor(() => {
      expect(loadingMessage.value).toBe('');
    });

    // 模拟向上滚动：手动 mock DOM 属性
    Object.defineProperty(logDisplay, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(logDisplay, 'scrollTop', {
      value: 200,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(logDisplay, 'clientHeight', { value: 500, configurable: true });

    fireEvent.scroll(logDisplay);

    // 5. 验证：此时向上滚动可以正常解锁
    await waitFor(() => {
      expect(lastBtn).not.toHaveClass('active');
    });
  });

  it('切换到统计分析时应显示加载信息，且中断加载切回日志时应清理加载状态', async () => {
    activeUI = await renderUI(mockAppState);
    const statsBtn = screen.getByTitle('数据统计');

    // 此时日志视图已加载完毕，进入缓存
    expect(screen.getByRole('textbox').value).toContain('Message 1');
    expect(loadingMessage.value).toBe('');

    // 1. 设置延迟，拦截 getMessages
    let resolveDelay;
    global.__test_delay_promise = new Promise((r) => {
      resolveDelay = r;
    });

    // 2. 触发统计分析
    fireEvent.click(statsBtn);

    // 3. 验证此时 StatsView 显示了 loadingMessage
    await waitFor(() => {
      const display = screen.getByRole('textbox');
      expect(display.value).toContain('正在读取统计数据');
    });

    // 4. 在加载完成前，再次点击切回 LogView
    fireEvent.click(statsBtn); // 触发 handleToggleView('stats') -> 'log'

    // 5. 解除延迟，让被废弃的 refreshView 继续执行完毕
    resolveDelay();

    // 6. 验证切回 LogView 时，因为它命中了缓存，loadingMessage 应被清理
    await waitFor(() => {
      const display = screen.getByRole('textbox');
      expect(display.value).not.toContain('正在读取统计数据');
      expect(display.value).toContain('Message 1');
    });

    global.__test_delay_promise = undefined;
  });
});
