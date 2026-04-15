import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '../src/storage/index.js';

// 模拟 parser 中的 DOM 提取函数
const mockParser = {
  extractServerFromDOM: vi.fn(),
};

describe('Server Recovery Logic (Integration)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await storageManager.init();
    vi.clearAllMocks();
  });

  it('启动时：如果 DOM 为空但存储有值，应当成功恢复服务器名', async () => {
    // 1. 预设存储数据
    await storageManager.setLastServer('Stored Server');

    // 2. 模拟启动时的变量持有 (对应 main.js 逻辑)
    let detectedServerName = await storageManager.getLastServer();

    // 模拟 DOM 此时为空 (已进场)
    mockParser.extractServerFromDOM.mockReturnValue(null);

    const currentFromDOM = mockParser.extractServerFromDOM();
    if (currentFromDOM && currentFromDOM !== detectedServerName) {
      detectedServerName = currentFromDOM;
    }

    // 3. 断言：即使 DOM 没抓到，变量也应该持有从存储恢复的值
    expect(detectedServerName).toBe('Stored Server');
  });

  it('运行中：检测到新服务器时应当立即更新存储', async () => {
    let detectedServerName = null;
    const setLastServerSpy = vi.spyOn(storageManager, 'setLastServer');

    // 1. 第一阶段：DOM 发现了新服务器
    mockParser.extractServerFromDOM.mockReturnValue('New Server');

    const server = mockParser.extractServerFromDOM();
    if (server && server !== detectedServerName) {
      detectedServerName = server;
      await storageManager.setLastServer(server);
    }

    // 2. 断言：变量已更新且 setLastServer 被调用
    expect(detectedServerName).toBe('New Server');
    expect(setLastServerSpy).toHaveBeenCalledWith('New Server');

    // 3. 第二阶段：DOM 变回 null (例如刷新或由于 UI 抖动)
    mockParser.extractServerFromDOM.mockReturnValue(null);

    const server2 = mockParser.extractServerFromDOM();
    if (server2 && server2 !== detectedServerName) {
      detectedServerName = server2;
    }

    // 4. 断言：变量应继续保持最后一次有效值，不会被 null 覆盖
    expect(detectedServerName).toBe('New Server');
  });
});
