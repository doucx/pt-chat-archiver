import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, getByRole, getByText, screen } from '@testing-library/dom';
import { createUI } from '../src/ui/index.js';

// Mock 全局 __APP_VERSION__
global.__APP_VERSION__ = '7.0.0-test';

// Mock 存储和回调，专注于 UI 行为
const mockStorage = {
  config: { pageSize: 100, autoSaveInterval: 30 },
  selfName: 'Tester',
};

const mockCallbacks = {
  scanAndMergeHistory: vi.fn(),
  saveMessagesToStorage: vi.fn(),
  cleanChannelRecords: vi.fn(),
  detectTotalDuplicates: vi.fn(() => 0),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(),
  onAutoSaveIntervalChange: vi.fn(),
};

/**
 * 辅助函数：在 JSDOM 中渲染整个 UI
 * @param {object} initialState - 模拟的初始聊天状态
 */
function renderUI(initialState) {
  document.body.innerHTML = ''; // 清理环境
  const ui = createUI(initialState, mockCallbacks);
  // 模拟服务器激活
  ui.updateServerDisplay('Test Server');
  return ui;
}

describe('UI Integration Smoke Tests', () => {
  let mockAppState;

  beforeEach(() => {
    // 为每个测试重置模拟数据
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
    // 重置所有 mock 函数的调用记录
    vi.clearAllMocks();
  });

  it('初始加载时应正确渲染数据和分页', async () => {
    renderUI(mockAppState);

    // 1. 等待并验证日志内容是否出现
    const logDisplay = screen.getByRole('textbox');
    // testing-library 的 findBy* 可以处理异步渲染，这里用 getBy* 因为目前是同步的
    expect(logDisplay.value).toContain('Message 1');
    expect(logDisplay.value).toContain(`Message 100`); // 默认 pageSize 是 1000，但我们测试用例里 pageSize 是 100

    // 2. 验证频道选择器是否被填充
    const channelSelector = screen.getByRole('combobox');
    expect(getByRole(channelSelector, 'option', { name: /Local/ })).toBeInTheDocument();
    expect(getByRole(channelSelector, 'option', { name: /Party/ })).toBeInTheDocument();

    // 3. 验证分页信息是否正确 (250条消息 / 100每页 = 3页)
    // 注意：UI state 的 pageSize 默认是 1000，需要调整测试使其失败或修正逻辑
    // 修正：我们从 ui/state.js 看到默认是 1000，所以分页应为 1/1。
    // 为了测试分页，我们必须模拟配置。
    const uiState = (await import('../src/ui/state.js')).createUIState();
    uiState.setPageSize(100);

    renderUI(mockAppState); // 重新渲染以应用新的页面大小
    const pageInfo = await screen.findByText('1 / 3');
    expect(pageInfo).toBeInTheDocument();
  });

  it('点击分页按钮应能切换页面内容', async () => {
    const uiState = (await import('../src/ui/state.js')).createUIState();
    uiState.setPageSize(100);
    renderUI(mockAppState);

    const logDisplay = screen.getByRole('textbox');
    const nextButton = screen.getByRole('button', { name: '›' });

    // 初始在第一页
    expect(logDisplay.value).toContain('Message 100');
    expect(logDisplay.value).not.toContain('Message 101');

    // 点击下一页
    fireEvent.click(nextButton);

    // 验证内容更新到第二页
    // `findBy` 将等待 UI 更新
    await screen.findByText('2 / 3');
    expect(logDisplay.value).not.toContain('Message 100');
    expect(logDisplay.value).toContain('Message 101');
    expect(logDisplay.value).toContain('Message 200');
  });

  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');
    const logView = document.getElementById('log-archive-log-view');
    const configView = document.getElementById('log-archive-config-view');

    // 初始状态：日志可见，设置隐藏
    expect(logView.style.display).toBe('flex');
    expect(configView.style.display).toBe('none');

    // 点击设置
    fireEvent.click(settingsButton);

    // 验证状态：日志隐藏，设置可见
    expect(logView.style.display).toBe('none');
    expect(configView.style.display).toBe('flex');

    // 再次点击，切换回来
    fireEvent.click(settingsButton);
    expect(logView.style.display).toBe('flex');
    expect(configView.style.display).toBe('none');
  });

  it('在设置中修改分页大小应能影响分页逻辑', async () => {
    renderUI(mockAppState);

    // 进入设置
    const settingsButton = screen.getByTitle('设置');
    fireEvent.click(settingsButton);

    // 找到输入框并修改值
    const pageSizeInput = screen.getByLabelText(/分页大小/);
    fireEvent.change(pageSizeInput, { target: { value: '50' } });

    // 切回日志视图
    fireEvent.click(settingsButton);

    // 验证分页已更新 (250条消息 / 50每页 = 5页)
    const pageInfo = await screen.findByText('1 / 5');
    expect(pageInfo).toBeInTheDocument();
  });
});