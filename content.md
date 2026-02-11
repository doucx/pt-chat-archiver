目前仍**不充足**。

虽然核心数据合并和基础迁移逻辑已经有了覆盖，但项目的两个关键功能区域仍然处于测试真空状态：
1.  **UI 状态管理 (`src/ui/state.js`)**: 覆盖率为 0%。该模块负责分页、视图切换、配置保存（PageSize, Interval）等逻辑。虽然它位于 `ui/` 目录下，但它是纯逻辑实现，不依赖复杂的 DOM，完全可以且应当被 100% 覆盖。
2.  **数据统计功能 (`src/analysis.js`)**: 尽管我们测试了清理逻辑，但 `calculateTopTalkers` 和 `calculateHourlyActivity`（即 UI 中“📊 统计”功能的核心）仍未被覆盖。
3.  **合成频道逻辑 (`src/state.js`)**: `addMessageToSyntheticChannelIfNeeded` 负责将私聊/队伍消息自动复制到特定频道，这部分逻辑目前也是未覆盖的。

我将生成一个计划，重点攻克这些逻辑模块，使核心业务逻辑的覆盖率迈向 80% 以上。

## [WIP] test: 扩展测试覆盖范围至 UI 状态管理与数据统计逻辑

### 用户需求
进一步提升测试覆盖率，特别是针对 UI 的状态管理 (`src/ui/state.js`)、统计分析函数 (`src/analysis.js`) 以及合成频道处理逻辑 (`src/state.js`)。

### 评论
目前的测试主要集中在“数据安全”维度（合并与迁移）。接下来的重点应转向“功能正确性”维度。UI 状态管理器是用户交互的中枢，如果分页逻辑或配置读取出现问题，将直接导致 UI 崩溃或数据展示异常。

### 目标
1.  **实现 UI 状态测试**: 为 `src/ui/state.js` 编写完整测试，涵盖初始配置加载、分页边界处理、服务器切换状态等。
2.  **覆盖统计分析**: 为 `src/analysis.js` 中的 `calculateTopTalkers` 和 `calculateHourlyActivity` 编写测试。
3.  **验证合成频道**: 在 `tests/core/state.test.js` 中补充 `addMessageToSyntheticChannelIfNeeded` 的测试。

### 基本原理
由于项目采用了模块化设计，`createUIState` 等函数返回的是闭包对象，通过在测试中调用这些对象的方法并观察其内部状态的变化（通过 `getState()`），可以非常方便地进行单元测试，而无需模拟真实的浏览器点击事件。

### 标签
#intent/tooling #flow/ready #priority/medium #comp/tests #comp/ui #concept/state #scope/dx #ai/brainstorm #task/domain/testing #task/object/ui-and-stats-logic #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 编写 UI 状态管理测试

这是目前最大的盲区，我们将测试 `createUIState` 的所有公开接口。

~~~~~act
write_file
tests/ui/state.test.js
~~~~~
~~~~~javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createUIState } from '../../src/ui/state.js';
import { storage } from '../../src/storage.js';

describe('ui/state.js: UI State Manager', () => {
  beforeEach(() => {
    localStorage.clear();
    // 模拟存储中的基础配置
    localStorage.setItem('chatLogArchive_config', JSON.stringify({ pageSize: 50, autoSaveInterval: 60 }));
  });

  it('应当能从存储中加载初始配置', () => {
    const uiState = createUIState();
    const state = uiState.getState();
    expect(state.pageSize).toBe(50);
    expect(state.autoSaveInterval).toBe(60);
  });

  it('分页逻辑应当正确处理边界', () => {
    const uiState = createUIState();
    uiState.setTotalPages(10);
    
    uiState.setPage(5);
    expect(uiState.getState().currentPage).toBe(5);
    
    uiState.setPage(999); // 超出上限
    expect(uiState.getState().currentPage).toBe(10);
    
    uiState.setPage(-1); // 低于下限
    expect(uiState.getState().currentPage).toBe(1);
  });

  it('应当能正确更新并保存配置', () => {
    const uiState = createUIState();
    uiState.setPageSize(200);
    expect(uiState.getState().pageSize).toBe(200);
    
    const storedConfig = JSON.parse(localStorage.getItem('chatLogArchive_config'));
    expect(storedConfig.pageSize).toBe(200);
  });

  it('应当正确处理服务器切换', () => {
    const uiState = createUIState();
    uiState.setActiveServer('Server A');
    expect(uiState.getState().activeServer).toBe('Server A');
    expect(uiState.getState().viewingServer).toBe('Server A'); // 首次设置时自动同步

    uiState.setViewingServer('Server B');
    expect(uiState.getState().viewingServer).toBe('Server B');
    expect(uiState.getState().activeServer).toBe('Server A'); // 查看服务器不改变活动服务器
  });
});
~~~~~

#### Acts 2: 补充数据统计逻辑测试

在 `tests/core/analysis.test.js` 中添加针对统计函数的测试。

~~~~~act
patch_file
tests/core/analysis.test.js
~~~~~
~~~~~javascript.old
    expect(cleanedRecords.filter(r => r.content === "duplicate").length).toBe(1);
  });
});
~~~~~
~~~~~javascript.new
    expect(cleanedRecords.filter(r => r.content === "duplicate").length).toBe(1);
  });
});

describe('analysis.js: Statistics Functions', () => {
  const mockMessages = [
    { sender: 'Alice', time: '2024-01-01T10:00:00Z', content: 'hi' },
    { sender: 'Alice', time: '2024-01-01T10:05:00Z', content: 'hello' },
    { sender: 'Bob', time: '2024-01-01T11:00:00Z', content: 'hey' },
    { sender: 'System', time: '2024-01-01T11:30:00Z', content: 'ignore' },
  ];

  it('calculateTopTalkers 应当正确计算用户比例并忽略系统消息', () => {
    const { data, total } = require('../../src/analysis.js').calculateTopTalkers(mockMessages);
    expect(total).toBe(3); // Alice(2) + Bob(1)
    expect(data[0]).toEqual({ name: 'Alice', count: 2 });
  });

  it('calculateHourlyActivity 应当正确按小时统计', () => {
    const { data } = require('../../src/analysis.js').calculateHourlyActivity(mockMessages);
    // 10点有2条，11点有2条（含系统）
    const hour10 = data.find(d => d.hour === 10);
    const hour11 = data.find(d => d.hour === 11);
    expect(hour10.count).toBe(2);
    expect(hour11.count).toBe(2);
  });
});
~~~~~

#### Acts 3: 补充合成频道逻辑测试

在 `tests/core/state.test.js` 中添加测试。

~~~~~act
patch_file
tests/core/state.test.js
~~~~~
~~~~~javascript.old
    expect(mergeAndDeduplicateMessages([{ content: 'a' }], [])).toEqual([{ content: 'a' }]);
  });
});
~~~~~
~~~~~javascript.new
    expect(mergeAndDeduplicateMessages([{ content: 'a' }], [])).toEqual([{ content: 'a' }]);
  });
});

describe('state.js: Synthetic Channels', () => {
  it('应当将队伍消息复制到 Party-Local 频道', () => {
    const { addMessageToSyntheticChannelIfNeeded } = require('../../src/state.js');
    const channelMap = { 'Local': [] };
    const partyMsg = { type: 'party', content: 'team up!' };
    
    addMessageToSyntheticChannelIfNeeded(channelMap, partyMsg, 'Local');
    
    expect(channelMap['Party-Local']).toBeDefined();
    expect(channelMap['Party-Local'][0].content).toBe('team up!');
  });

  it('非 Local 频道的消息不应触发合成', () => {
    const { addMessageToSyntheticChannelIfNeeded } = require('../../src/state.js');
    const channelMap = { 'Party': [] };
    const partyMsg = { type: 'party', content: 'inner msg' };
    
    addMessageToSyntheticChannelIfNeeded(channelMap, partyMsg, 'Party');
    expect(channelMap['Party-Local']).toBeUndefined();
  });
});
~~~~~

### 下一步建议
- **DOM 解析测试**: `src/parser.js` 仍有约 30% 未覆盖，下一步建议针对 `customTextContent` 编写测试，模拟各种复杂的 HTML 结构（含 Emoji 图片、PUA 字符等）以验证解析鲁棒性。
- **渲染器冒烟测试**: 虽然 `renderer.js` 与 UI 紧密耦合，但可以尝试编写基础的单元测试，验证例如“正在记录”状态下颜色样式的逻辑判断。
- **配置持久化边界**: 测试存储满（localStorage Quota Exceeded）时的异常处理逻辑。
