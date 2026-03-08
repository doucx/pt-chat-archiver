import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  getMessagesChunk: async (server, channel, lastTime, limit) => {
    // 模拟分片读取
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
      scanAllDuplicatesAsync: vi.fn(async () => {
        // Mock a return of 24 duplicate IDs for the test
        return new Array(24).fill('mock-id');
      }),
      deleteMessages: vi.fn(async (ids) => {
        // Mock delete action: manually remove from mockAppState
        if (ids.length > 0) {
          mockAppState['Server A'].Local = [mockAppState['Server A'].Local[0]];
        }
      }),
      deactivateLogger: vi.fn(),
      manualSave: vi.fn(),
      onAutoSaveIntervalChange: vi.fn(),
    };

    // 模拟确认对话框
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('点击扫描后应能正确识别重复项并改变按钮状态为清理', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');

    // 进入设置页面
    const settingsButton = screen.getByTitle('设置');
    fireEvent.click(settingsButton);

    const scanButton = await screen.findByText('扫描重复记录');
    
    // 点击扫描
    fireEvent.click(scanButton);

    // 验证按钮状态改变
    const cleanButton = await screen.findByText(/清理重复 \(24\)/);
    expect(cleanButton).toBeInTheDocument();
    expect(cleanButton).toHaveClass('active');
  });

  it('点击清理按钮应当执行删除逻辑并重置 UI', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');

    fireEvent.click(screen.getByTitle('设置'));
    
    const scanButton = await screen.findByText('扫描重复记录');
    fireEvent.click(scanButton);
    
    const cleanButton = await screen.findByText(/清理重复 \(24\)/);

    // 执行清理
    fireEvent.click(cleanButton);

    // 验证逻辑：
    // 1. 弹出确认框 (已 mock)
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });

    // 2. 数据被清理 (通过 mock 的 deleteMessages 验证)
    expect(mockAppState['Server A'].Local.length).toBe(1);
    expect(mockCallbacks.deleteMessages).toHaveBeenCalled();

    // 3. UI 反馈
    await waitFor(() => {
      expect(cleanButton.textContent).toBe('清理完毕!');
    });
  });

  it('当没有重复项时，点击扫描应当重置按钮', async () => {
    // 覆盖 mock 返回空数组
    mockCallbacks.scanAllDuplicatesAsync.mockResolvedValueOnce([]);
    
    const cleanState = {
      S1: { L1: [{ content: 'unique', time: new Date().toISOString(), type: 'say' }] },
    };
    const adapter = createMockAdapter(cleanState);
    await createUI(adapter, mockCallbacks);

    fireEvent.click(screen.getByTitle('设置'));

    const scanButton = await screen.findByText('扫描重复记录');
    fireEvent.click(scanButton);

    // 等待 UI 反馈
    await waitFor(() => {
      expect(scanButton.textContent).toBe('未发现重复');
    });
  });
});
