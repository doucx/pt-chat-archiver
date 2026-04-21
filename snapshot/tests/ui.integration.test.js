import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
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
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
    const start = (page - 1) * pageSize;
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
  return ui;
}

describe('UI Integration Smoke Tests', () => {
  let mockAppState;

  beforeEach(async () => {
    await storageManager.init();
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
    await renderUI(mockAppState);

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
    await renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');
    const logView = document.getElementById('log-archive-log-view');
    const configView = document.getElementById('log-archive-config-view');

    // 初始状态
    expect(logView).toBeVisible();
    expect(configView).not.toBeVisible();

    // 点击设置 (触发异步刷新)
    fireEvent.click(settingsButton);

    // 必须使用 waitFor 等待异步 DOM 变更
    await waitFor(() => {
      expect(logView).not.toBeVisible();
      expect(configView).toBeVisible();
    });

    // 再次点击切回
    fireEvent.click(settingsButton);
    await waitFor(() => {
      expect(logView).toBeVisible();
    });
  });

  it('在设置中修改分页大小应能实时改变日志显示条数', async () => {
    await renderUI(mockAppState);

    // 1. 进入设置
    fireEvent.click(screen.getByTitle('设置'));

    // 2. 找到分页大小输入框并改为 50
    const pageSizeInput = screen.getByLabelText(/分页大小/);
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
    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 50');
    expect(logDisplay.value).not.toContain('Message 51');
  });

  it('在加载过程中发生的滚动不应触发错误解锁', async () => {
    await renderUI(mockAppState);
    const lastBtn = screen.getByText('»');
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
    expect(lastBtn).toHaveClass('active');

    // 4. 模拟加载完成
    logDisplay.value = 'Line 1\nLine 2\nLine 3';
    // 模拟向上滚动：手动 mock DOM 属性
    Object.defineProperty(logDisplay, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(logDisplay, 'scrollTop', { value: 200, configurable: true });
    Object.defineProperty(logDisplay, 'clientHeight', { value: 500, configurable: true });

    fireEvent.scroll(logDisplay);

    // 5. 验证：此时向上滚动可以正常解锁
    expect(lastBtn).not.toHaveClass('active');
  });
});
