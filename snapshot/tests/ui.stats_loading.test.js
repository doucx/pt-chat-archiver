import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
import { loadingMessage, viewMode } from '../src/ui/store/uiStore.js';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';

const mockCallbacks = {
  scanAndMergeHistory: vi.fn(),
  saveMessagesToStorage: vi.fn(),
  scanAllDuplicatesAsync: vi.fn(),
  deleteMessages: vi.fn(),
  deactivateLogger: vi.fn(),
};

describe('UI Loading State Regression', () => {
  let activeUI = null;

  beforeEach(async () => {
    document.body.innerHTML = '';
    await storageManager.init();
    loadingMessage.value = ''; // 重置信号
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (activeUI) {
      activeUI.destroy();
    }
  });

  it('统计视图应当显示加载进度', async () => {
    // 构造一个具有明显延迟和进度汇报的 Adapter
    const adapter = {
      getServers: async () => ['S1'],
      getChannels: async () => ['Local'],
      getChannelCount: async () => 1000,
      getMessages: async (s, c, p, sz, onProgress) => {
        // 模拟一个耗时的拉取
        for (let i = 1; i <= 2; i++) {
          if (onProgress) onProgress(i * 500, 1000);
          await new Promise((r) => setTimeout(r, 20));
        }
        return { messages: [], total: 1000 };
      },
    };

    activeUI = await createUI(adapter, mockCallbacks);
    await activeUI.updateRecordingStatus('S1', 'Local');

    // 1. 进入统计视图
    viewMode.value = 'stats';

    // 2. 验证加载提示是否出现在 DOM 中
    await waitFor(() => {
      const statsDisplay = screen.getByRole('textbox');
      expect(statsDisplay.value).toContain('⏳ 正在读取统计数据...');
      expect(statsDisplay.value).toContain('500 / 1000');
    });

    // 3. 等待加载完成，提示应当消失
    await waitFor(() => {
      const statsDisplay = screen.getByRole('textbox');
      expect(statsDisplay.value).not.toContain('⏳');
    }, { timeout: 1000 });
  });

  it('切换到设置视图时应当强制清理加载残留', async () => {
    // 构造一个永不结束的加载
    const adapter = {
      getServers: async () => ['S1'],
      getChannels: async () => ['Local'],
      getChannelCount: async () => 1000,
      getMessages: () => new Promise(() => {}), // 永久悬挂
    };

    activeUI = await createUI(adapter, mockCallbacks);
    await activeUI.updateRecordingStatus('S1', 'Local');

    // 1. 触发统计加载
    viewMode.value = 'stats';
    
    // 确保信号已被设置
    await waitFor(() => expect(loadingMessage.value).toContain('⏳'));

    // 2. 在加载中切换到设置模式
    viewMode.value = 'config';

    // 3. 验证信号是否被清理
    await waitFor(() => {
      expect(loadingMessage.value).toBe('');
    });

    // 4. 切回日志模式，验证日志视图是否干净
    viewMode.value = 'log';
    await waitFor(() => {
      const logDisplay = screen.getByRole('textbox');
      // 由于 adapter.getMessages 悬挂，这里应由 refreshView 逻辑保证
      // 新一轮 log 拉取开始前会设置 LOADING_PREPARE，所以我们验证它不包含之前的统计提示
      expect(logDisplay.value).not.toContain('正在读取统计数据');
    });
  });
});