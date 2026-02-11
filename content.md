太棒了！既然基础环境已经跑通，我们现在为项目的核心逻辑——存储管理、数据解析和统计分析——建立全面的测试覆盖。

这不仅能确保当前功能的稳定性，还能为后续可能的重构（例如优化解析算法或升级存储结构）提供安全保障。

## [WIP] feat(testing): 为存储、解析和分析模块添加核心单元测试

### 用户需求
针对项目的核心功能模块编写详细的单元测试。

### 评论
随着项目复杂度的增加，手动测试 DOM 节点解析和复杂的重复清理逻辑变得非常低效且容易遗漏边缘情况。建立这些测试将极大地提升开发信心。

### 目标
1.  **Storage 测试**: 验证 `localStorage` 的分层读写和配置管理。
2.  **Analysis 测试**: 验证统计分析算法（活跃用户、高峰时段）和重复记录识别逻辑（Burst Detection）。
3.  **Parser 测试**: 验证对 PonyTown 聊天 DOM 结构的解析准确性，包括对 Emoji 和私聊方向的识别。

### 基本原理
我们利用 Vitest 提供的 `jsdom` 环境来模拟浏览器行为。对于 `storage.js`，我们直接操作模拟的 `localStorage`；对于 `parser.js`，我们在测试中动态创建 DOM 结构并传给解析函数。

### 标签
#intent/tooling #flow/ready #priority/high #comp/tests #scope/dx #ai/instruct #task/domain/testing #task/object/test-suite #task/action/expansion #task/state/continue

---

### Script

#### Acts 1: 创建存储模块测试 (`tests/storage.test.js`)

验证 `storage.js` 是否能正确处理 V6 数据结构、配置信息以及用户身份信息。

~~~~~act
write_file
tests/storage.test.js
~~~~~
~~~~~javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../src/storage.js';
import { STORAGE_KEY_V6, CONFIG_KEY, SELF_NAME_KEY } from '../src/constants.js';

describe('Storage Module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('应当能正确保存和读取 V6 消息数据', () => {
    const mockData = { "Main Server": { "Local": [{ content: 'hello' }] } };
    storage.saveV6Messages(mockData);
    expect(storage.getV6Messages()).toEqual(mockData);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_V6))).toEqual(mockData);
  });

  it('应当能正确管理配置项并提供默认值', () => {
    const defaultConfig = storage.getConfig();
    expect(defaultConfig.pageSize).toBe(1000);

    const newConfig = { pageSize: 50, autoSaveInterval: 60 };
    storage.saveConfig(newConfig);
    expect(storage.getConfig()).toEqual(newConfig);
  });

  it('应当能保存和检索用户昵称', () => {
    storage.setSelfName('TestUser  ');
    expect(storage.getSelfName()).toBe('TestUser'); // 验证 trim
    expect(localStorage.getItem(SELF_NAME_KEY)).toBe('TestUser');
  });

  it('清空操作应当移除相关 key', () => {
    storage.saveV6Messages({ a: 1 });
    storage.clearAllMessages();
    expect(storage.getV6Messages()).toEqual({});
  });
});
~~~~~

#### Acts 2: 创建统计与清理逻辑测试 (`tests/analysis.test.js`)

验证统计报表生成逻辑和关键的“爆发期重复记录”识别逻辑。

~~~~~act
write_file
tests/analysis.test.js
~~~~~
~~~~~javascript
import { describe, it, expect } from 'vitest';
import { calculateTopTalkers, calculateHourlyActivity, cleanChannelRecords } from '../src/analysis.js';

describe('Analysis Module', () => {
  const mockMessages = [
    { sender: 'Alice', content: 'Hi', time: '2023-01-01T10:00:00Z', type: 'say' },
    { sender: 'Alice', content: 'How are you?', time: '2023-01-01T10:05:00Z', type: 'say' },
    { sender: 'Bob', content: 'Hello', time: '2023-01-01T11:00:00Z', type: 'say' },
    { sender: 'System', content: 'Welcome', time: '2023-01-01T11:00:00Z', type: 'system' }
  ];

  it('calculateTopTalkers 应当正确计算用户发言权重并过滤系统消息', () => {
    const { data, total } = calculateTopTalkers(mockMessages);
    expect(total).toBe(3);
    expect(data[0].name).toBe('Alice');
    expect(data[0].count).toBe(2);
  });

  it('calculateHourlyActivity 应当正确识别高峰小时', () => {
    const { data } = calculateHourlyActivity(mockMessages);
    // 10点有2条，11点有2条（包含系统消息，因为此函数目前不检查 sender）
    expect(data.find(d => d.hour === 10).count).toBe(2);
  });

  it('cleanChannelRecords 应当能识别并在爆发期清理重复项', () => {
    // 构造一个爆发期：1秒内有20条相同的消息
    const now = Date.now();
    const burstMessages = [];
    for (let i = 0; i < 25; i++) {
      burstMessages.push({
        content: 'Spam',
        time: new Date(now + i).toISOString(),
        is_historical: false,
        type: 'say'
      });
    }

    const { cleanedRecords, removedCount } = cleanChannelRecords(burstMessages);
    // 第一条会保留（作为内容源），后续重复且在爆发期内的会被删
    expect(removedCount).toBeGreaterThan(0);
    expect(cleanedRecords.length).toBeLessThan(25);
  });
});
~~~~~

#### Acts 3: 创建解析引擎测试 (`tests/parser.test.js`)

通过模拟 DOM 节点，验证解析器对不同消息类型（普通发言、私聊）的识别能力。

~~~~~act
write_file
tests/parser.test.js
~~~~~
~~~~~javascript
import { describe, it, expect } from 'vitest';
import { extractUsefulData, findActiveTabByClass } from '../src/parser.js';

describe('Parser Module', () => {
  // 模拟窗口环境
  global.window = { location: { hostname: 'pony.town' } };

  it('应当能从 DOM 元素中解析普通发言', () => {
    const el = document.createElement('div');
    el.className = 'chat-line';
    el.innerHTML = `
      <span class="chat-line-timestamp">10:00</span>
      <span class="chat-line-name">[SenderName]</span>
      <span class="chat-line-message">Hello World</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('say');
    expect(data.sender).toBe('SenderName');
    expect(data.content).toBe('Hello World');
  });

  it('应当能识别发出的私聊 (To ...)', () => {
    const el = document.createElement('div');
    el.className = 'chat-line chat-line-whisper';
    el.innerHTML = `
      <span class="chat-line-name">[Target]</span>
      <span class="chat-line-message">To Target: private message</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('whisper');
    expect(data.sender).toBe('Me');
    expect(data.receiver).toBe('Target');
  });

  it('findActiveTabByClass 应当识别活跃标签页', () => {
    const html = `
      <div class="chat-log-tabs">
        <a class="chat-log-tab">Local</a>
        <a class="chat-log-tab active">Party</a>
      </div>
    `;
    expect(findActiveTabByClass(html)).toBe('Party');
  });
});
~~~~~

### 下一步建议

1.  **执行测试**: 运行 `npm test`。现在你应该能看到 4 个测试文件（包含之前的 utils）全部通过。
2.  **集成测试**: 下一步可以考虑编写 `tests/integration.test.js`，模拟从“发现新 DOM 节点”到“存入内存状态”再到“保存到本地存储”的完整链路。
3.  **覆盖率报告**: 如果需要，可以配置 `c8` 或 `istanbul` 来查看代码测试覆盖率。
