import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.js';
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
      startIndex = list.findIndex(m => m.time > lastTime);
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
  ui.updateServerDisplay('Test Server');
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
});
