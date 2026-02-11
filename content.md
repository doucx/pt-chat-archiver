当前的测试覆盖率报告显示，项目的核心逻辑层（`src/`）存在严重的测试盲区，特别是涉及数据安全与一致性的模块（`state.js`, `migrations.js`）覆盖率为 0%，这在处理用户聊天存档这种持久化数据时具有极高的风险。

我将生成一个计划，优先为这些核心逻辑补充单元测试，以确保数据合并、迁移和分析的准确性。

## [WIP] test: 为核心数据处理与迁移逻辑补充单元测试

### 用户需求
分析当前的测试覆盖率报告，找出测试薄弱环节，并编写必要的测试用例以提升系统的稳健性，特别是针对 `src/state.js`、`src/migrations.js` 和 `src/analysis.js` 中的复杂逻辑。

### 评论
当前覆盖率（22.59%）远低于安全基准。尤其是 `state.js` 中的 `mergeAndDeduplicateMessages` 算法和 `migrations.js` 中的版本迁移逻辑，它们直接决定了用户数据是否会丢失或损坏。UI 状态管理 (`src/ui/state.js`) 虽然是 UI 层的，但其逻辑不依赖 DOM，完全具备可测试性。

### 目标
1.  **覆盖核心合并算法**: 为 `src/state.js` 编写测试，涵盖消息重叠、完全不连续（空洞检测）以及空数据处理等场景。
2.  **覆盖数据迁移逻辑**: 为 `src/migrations.js` 编写测试，模拟 `localStorage` 环境验证 V4->V5 和 V5->V6 的迁移正确性。
3.  **强化分析与清理逻辑**: 提升 `src/analysis.js` 的覆盖率，重点测试“消息爆发检测 (Burst Identification)”和“重复记录清理”。
4.  **建立 UI 状态测试**: 为 `src/ui/state.js` 建立基础测试。

### 基本原理
利用 `vitest` 和 `jsdom` 环境，通过模拟 `localStorage` 和构造边缘情况的输入数据，对纯逻辑函数进行黑盒测试。由于 `src/main.js` 涉及大量无法在 jsdom 中完美模拟的浏览器事件流，维持其排除状态是合理的，但其调用的底层原子函数必须实现 90% 以上的覆盖。

### 标签
#intent/tooling #flow/ready #priority/high #comp/tests #concept/state #concept/history #scope/dx #ai/brainstorm #task/domain/testing #task/object/core-logic-tests #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 创建测试目录结构

由于当前环境中缺乏对应的测试文件，首先建立测试目录。

~~~~~act
run_command
~~~~~
~~~~~
mkdir -p tests/core tests/ui
~~~~~

#### Acts 2: 编写 `src/state.js` 的测试用例

针对核心的 `mergeAndDeduplicateMessages` 算法，这是防止数据重复和检测断层的关键。

~~~~~act
write_file
tests/core/state.test.js
~~~~~
~~~~~javascript
import { describe, it, expect, vi } from 'vitest';
import { mergeAndDeduplicateMessages } from '../../src/state.js';

describe('state.js: mergeAndDeduplicateMessages', () => {
  it('应当能合并有重叠的消息序列', () => {
    const oldMsgs = [{ content: 'a' }, { content: 'b' }, { content: 'c' }];
    const newMsgs = [{ content: 'b' }, { content: 'c' }, { content: 'd' }];
    const result = mergeAndDeduplicateMessages(oldMsgs, newMsgs);
    expect(result.map(m => m.content)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('当没有重叠时，应当插入断层警告标记', () => {
    const oldMsgs = [{ content: 'a' }];
    const newMsgs = [{ content: 'z' }];
    const result = mergeAndDeduplicateMessages(oldMsgs, newMsgs);
    expect(result.length).toBe(3); // a + system_mark + z
    expect(result[1].sender).toBe('Archiver');
    expect(result[1].content).toContain('可能存在记录丢失');
  });

  it('应当处理空输入的情况', () => {
    expect(mergeAndDeduplicateMessages([], [{ content: 'a' }])).toEqual([{ content: 'a' }]);
    expect(mergeAndDeduplicateMessages([{ content: 'a' }], [])).toEqual([{ content: 'a' }]);
  });
});
~~~~~

#### Acts 3: 编写 `src/migrations.js` 的测试用例

模拟 V4 格式数据并验证其是否正确转换为 V6。

~~~~~act
write_file
tests/core/migrations.test.js
~~~~~
~~~~~javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MigrationManager } from '../../src/migrations.js';
import { storage } from '../../src/storage.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('V4 -> V5: 应当能将本地时间字符串转换为 ISO 格式', () => {
    const v4Data = {
      "Local": [{ time: "2023-10-01 12:00:00", content: "hello" }]
    };
    localStorage.setItem('chatLogArchive_v4', JSON.stringify(v4Data));
    
    MigrationManager.migrateV4toV5();
    
    const v5Data = JSON.parse(localStorage.getItem('chatLogArchive_v5'));
    expect(new Date(v5Data.Local[0].time).toISOString()).toBeDefined();
    expect(localStorage.getItem('chatLogArchive_v4')).toBeNull();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', () => {
    const v5Data = { "Local": [{ content: "msg" }] };
    MigrationManager.migrateV5toV6(v5Data, "Main Server");
    
    const v6Data = JSON.parse(localStorage.getItem('chatLogArchive_v6'));
    expect(v6Data["Main Server"].Local[0].content).toBe("msg");
    expect(localStorage.getItem('chatLogArchive_v5')).toBeNull();
  });
});
~~~~~

#### Acts 4: 编写 `src/analysis.js` 的测试用例

补全爆发检测（Burst Detection）逻辑的测试，这部分在报告中处于“未覆盖”状态。

~~~~~act
write_file
tests/core/analysis.test.js
~~~~~
~~~~~javascript
import { describe, it, expect } from 'vitest';
import { cleanChannelRecords, detectTotalDuplicates } from '../../src/analysis.js';

describe('analysis.js: Data Cleaning', () => {
  it('应当能识别并在爆发期内清理重复记录', () => {
    // 构造一个超过阈值的爆发序列 (20条消息，1秒内)
    const baseTime = new Date('2024-01-01T10:00:00Z').getTime();
    const records = [];
    for (let i = 0; i < 25; i++) {
      records.push({
        time: new Date(baseTime + i).toISOString(), // 间隔1ms
        content: i < 5 ? "unique" + i : "duplicate",
        is_historical: false
      });
    }
    
    const { cleanedRecords, removedCount } = cleanChannelRecords(records);
    // 只有第一条 "duplicate" 会被保留，后续在爆发期内的会被移除
    expect(removedCount).toBeGreaterThan(0);
    expect(cleanedRecords.filter(r => r.content === "duplicate").length).toBe(1);
  });
});
~~~~~

### 下一步建议
- **UI 状态测试**: 下一步建议为 `src/ui/state.js` 补充测试，特别是分页逻辑和配置保存逻辑。
- **集成测试**: 考虑使用 `vitest` 模拟更复杂的 `MutationObserver` 序列，以测试 `main.js` 中的 `handleNewChatMessage` 处理流程。
- **自动化**: 将覆盖率检查集成到预提交钩子（pre-commit hook）中，确保新代码不会拉低平均水平。
