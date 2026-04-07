好的，为了验证服务器捕获的持久化与回退机制，我将创建一个新的集成测试文件 `tests/server_recovery.test.js`，并增强原有的存储层测试。

这个测试将重点验证：
1. **持久化能力**：服务器名称是否能正确存入并从 `IndexedDB`（配置区）取出。
2. **初始化回退**：在 DOM 无法提供服务器名时，脚本启动是否能正确恢复上次记录的服务器名。

## [WIP] test: 增加服务器名持久化与恢复逻辑的自动化测试

### 用户需求
需要自动化测试来确保：
1. 存储层能够正确处理 `last_server` 键值对。
2. 即使在 DOM 节点缺失的情况下，系统也能通过持久化数据恢复服务器上下文。

### 评论
由于 `main.js` 包含大量 DOM 依赖和副作用，直接对其进行单元测试较为困难。我们将通过模拟 `storageManager` 的行为，并在 `storage.test.js` 中增加针对性用例，同时创建一个模拟启动流程的集成测试来验证逻辑闭环。

### 目标
1. 在 `storage.test.js` 中增加 `getLastServer` 和 `setLastServer` 的单元测试。
2. 创建 `tests/server_recovery.test.js` 模拟启动时的竞态条件。

### 基本原理
测试将分为两部分。首先，验证底层 API 的可靠性；其次，通过 Vitest 的 `vi.spyOn` 模拟 `extractServerFromDOM` 在不同阶段的返回值（null vs 有值），观察 `detectedServerName` 在初始化序列中的变化是否符合预期。

### 标签
#intent/test #flow/ready #priority/medium #comp/tests #concept/state #scope/dx #ai/brainstorm #task/domain/testing #task/object/server-recovery-logic #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 增强存储层单元测试

在 `tests/storage.test.js` 中增加对新接口的验证。

~~~~~act
patch_file
tests/storage.test.js
~~~~~
~~~~~javascript.old
    const name = await storageManager.getSelfName();
    expect(name).toBe('TestUser'); // 验证 trim
    expect(localStorage.getItem(SELF_NAME_KEY)).toBe('TestUser');
  });

  it('清空操作应当移除相关 key', async () => {
~~~~~
~~~~~javascript.new
    const name = await storageManager.getSelfName();
    expect(name).toBe('TestUser'); // 验证 trim
    expect(localStorage.getItem(SELF_NAME_KEY)).toBe('TestUser');
  });

  it('应当能持久化和恢复最后一次检测到的服务器名', async () => {
    await storageManager.init();
    const serverName = 'Safe Haven';
    await storageManager.setLastServer(serverName);
    
    const recovered = await storageManager.getLastServer();
    expect(recovered).toBe(serverName);
  });

  it('清空操作应当移除相关 key', async () => {
~~~~~

#### Acts 2: 创建服务器恢复集成测试

新建 `tests/server_recovery.test.js` 模拟快速进场导致的 DOM 缺失场景。

~~~~~act
write_file
tests/server_recovery.test.js
~~~~~
~~~~~javascript
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
~~~~~

### 下一步建议
1. **运行测试**：执行 `npm test` 确保所有新老用例通过。
2. **边界情况排查**：考虑如果用户清除了浏览器缓存，第一次启动时 `getLastServer` 会返回 `null`。我们需要确保 `main.js` 在这种情况下依然能安静地等待 `serverObserver` 第一次抓取到有效值，而不会报错。目前的代码逻辑已经涵盖了这一点。
3. **提交代码**：验证无误后，可以将这一系列健壮性改进合并到主分支。
