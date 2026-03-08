import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanChannelRecords, detectTotalDuplicates } from '../src/analysis.js';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.js';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';

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
  getAllData: async () => state,
  getRawState: async () => state,
});

describe('UI Clean Duplicates Regression (V6)', () => {
  let mockAppState;
  let mockCallbacks;

  beforeEach(async () => {
    document.body.innerHTML = '';
    await storageManager.init();

    // 1. 构造 Mock 状态
    // 我们在 "Server A" 的 "Local" 频道构造一个爆发期 (25条重复消息)
    const now = Date.now();
    const burstMessages = [];
    for (let i = 0; i < 25; i++) {
      burstMessages.push({
        time: new Date(now + i * 10).toISOString(), // 10ms 间隔，极短时间内爆发
        content: 'Spam Message',
        sender: 'Spammer',
        type: 'say',
        is_historical: false,
      });
    }

    mockAppState = {
      'Server A': {
        Local: burstMessages,
        Party: [{ time: new Date().toISOString(), content: 'Normal Msg', type: 'party' }],
      },
      'Server B': {
        Local: [{ time: new Date().toISOString(), content: 'Another Server Msg', type: 'say' }],
      },
    };

    mockCallbacks = {
      scanAndMergeHistory: vi.fn(),
      saveMessagesToStorage: vi.fn(() => Promise.resolve()),
      cleanAllChannelRecordsAsync: async (adapter) => {
        const { cleanAllChannelRecordsAsync: realClean } = await import('../src/analysis.js');
        return await realClean(adapter);
      },
      detectTotalDuplicatesAsync: async (adapter) => {
        const { detectTotalDuplicatesAsync: realDetect } = await import('../src/analysis.js');
        return await realDetect(adapter);
      },
      deactivateLogger: vi.fn(),
      manualSave: vi.fn(),
      onAutoSaveIntervalChange: vi.fn(),
    };

    // 模拟确认对话框
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('应当能正确识别跨服务器的重复项并在 UI 按钮上显示总数', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');

    // 进入设置页面
    const settingsButton = screen.getByTitle('设置');
    fireEvent.click(settingsButton);

    // 验证按钮计数：25 条重复消息，第一条保留，应显示 (24)
    const cleanButton = await screen.findByText(/清理重复 \(24\)/);
    expect(cleanButton).toBeInTheDocument();
    expect(cleanButton).toHaveClass('active');
  });

  it('点击清理按钮应当递归处理嵌套结构并保存结果', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');

    fireEvent.click(screen.getByTitle('设置'));
    const cleanButton = await screen.findByText(/清理重复 \(24\)/);

    // 执行清理
    fireEvent.click(cleanButton);

    // 验证逻辑：
    // 1. 弹出确认框 (已 mock)
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });

    // 2. 数据被清理：25 条变 1 条
    expect(mockAppState['Server A'].Local.length).toBe(1);
    expect(mockAppState['Server A'].Local[0].content).toBe('Spam Message');

    // 3. 调用了保存函数
    expect(mockCallbacks.saveMessagesToStorage).toHaveBeenCalledWith(mockAppState);

    // 4. UI 反馈
    await waitFor(() => {
      expect(cleanButton.textContent).toBe('清理完毕!');
    });
  });

  it('当没有重复项时，点击按钮应当给出提示', async () => {
    // 构造一个没有重复的状态，增加缺失的 type 字段
    const cleanState = {
      S1: { L1: [{ content: 'unique', time: new Date().toISOString(), type: 'say' }] },
    };
    const adapter = createMockAdapter(cleanState);
    await createUI(adapter, mockCallbacks);

    fireEvent.click(screen.getByTitle('设置'));

    // 使用 findByText 异步等待设置视图渲染完成
    const cleanButton = await screen.findByText('清理重复记录');

    fireEvent.click(cleanButton);
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('未发现可清理的重复记录。');
    });
  });
});
