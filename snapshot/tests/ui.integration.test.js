import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUI } from '../src/ui/index.js';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';

const mockCallbacks = {
  scanAndMergeHistory: vi.fn(() => Promise.resolve()),
  saveMessagesToStorage: vi.fn(() => Promise.resolve()),
  cleanChannelRecords: vi.fn(),
  detectTotalDuplicates: vi.fn(() => 0),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(() => Promise.resolve()),
  onAutoSaveIntervalChange: vi.fn(),
};

async function renderUI(initialState) {
  document.body.innerHTML = '';
  const ui = await createUI(initialState, mockCallbacks);
  ui.updateServerDisplay('Test Server');
  return ui;
}

import { storageManager } from '../src/storage';

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

    // 验证默认选中的频道是 Local 并且显示了数据
    const channelSelector = screen.getByRole('combobox');
    expect(channelSelector.value).toBe('Local');

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

    // 点击设置 (模拟切换到 config 模式)
    fireEvent.click(settingsButton);
    expect(logView).not.toBeVisible();
    expect(configView).toBeVisible();

    // 再次点击切回
    fireEvent.click(settingsButton);
    expect(logView).toBeVisible();
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
