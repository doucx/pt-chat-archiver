从覆盖率报告对比来看，我们在规范化过程中由于过度清理，丢失了几个关键的测试维度，导致总覆盖率从 **38.7%** 下滑到了 **32.21%**。

**我们失去的测试内容包括：**
1.  **UI 状态管理 (`src/ui/state.js`)**: 这是最严重的损失（从 85.18% 降至 0%）。分页逻辑、配置自动保存、服务器自动跟随等逻辑完全失去了保护。
2.  **消息爆发清理 (`src/analysis.js`)**: `cleanChannelRecords` 中的 `identifyBurstDuplicates` 逻辑（处理 1 秒内 20 条消息的爆发检测）在当前测试中被遗漏了。
3.  **V4 到 V5 的静默迁移 (`src/migrations.js`)**: 当前仅测试了 V5->V6，导致旧版本时间戳标准化的逻辑失去了验证。

我将生成计划，将这些遗失的“灵魂”添加回来，并确保它们在新的规范化架构中运行。

## [WIP] test: 找回遗失的测试用例并实现逻辑全覆盖

### 用户需求
找回在重构过程中丢失的 UI 状态测试、消息爆发清理测试以及 V4 迁移测试。

### 评论
覆盖率的下滑说明我们的“规范化”操作删减了过多的逻辑验证。一个稳健的系统不仅要代码整洁，更要保证每一个边缘逻辑（Edge Case）都有据可查。特别是 UI 状态管理，虽然它不操作 DOM，但它是控制用户界面的“大脑”，必须 100% 覆盖。

### 目标
1.  **找回 UI 状态测试**: 创建 `tests/ui_state.test.js`，恢复对分页、配置加载与保存、服务器跟随逻辑的测试。
2.  **完善分析测试**: 在 `tests/analysis.test.js` 中补回爆发期重复项清理的测试用例。
3.  **完善迁移测试**: 在 `tests/migrations.test.js` 中添加 V4 到 V5 的静默迁移验证。

### 标签
#intent/refine #flow/ready #priority/high #comp/tests #comp/ui #concept/state #scope/dx #ai/refine #task/domain/testing #task/object/test-recovery #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 恢复 UI 状态管理测试

我们将重新创建 `tests/ui_state.test.js`，这是提升覆盖率最有效的举措。

~~~~~act
write_file
tests/ui_state.test.js
~~~~~
~~~~~javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { createUIState } from '../src/ui/state.js';

describe('ui/state.js: UI State Manager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('应当能从存储中加载初始配置并处理默认值', () => {
    localStorage.setItem('chatLogArchive_config', JSON.stringify({ pageSize: 50 }));
    const uiState = createUIState();
    expect(uiState.getState().pageSize).toBe(50);
    expect(uiState.getState().autoSaveInterval).toBe(30); // 默认值
  });

  it('分页逻辑应当正确处理越界情况', () => {
    const uiState = createUIState();
    uiState.setTotalPages(5);
    
    uiState.setPage(3);
    expect(uiState.getState().currentPage).toBe(3);
    
    uiState.setPage(10); // 超过最大页
    expect(uiState.getState().currentPage).toBe(5);
    
    uiState.setPage(0); // 小于最小页
    expect(uiState.getState().currentPage).toBe(1);
  });

  it('修改配置应当同步到本地存储', () => {
    const uiState = createUIState();
    uiState.setPageSize(200);
    const stored = JSON.parse(localStorage.getItem('chatLogArchive_config'));
    expect(stored.pageSize).toBe(200);
  });

  it('应当正确处理服务器激活与查看逻辑', () => {
    const uiState = createUIState();
    uiState.setActiveServer('PonyServer');
    expect(uiState.getState().activeServer).toBe('PonyServer');
    expect(uiState.getState().viewingServer).toBe('PonyServer'); // 初始应跟随

    uiState.setViewingServer('OldArchive');
    expect(uiState.getState().viewingServer).toBe('OldArchive');
    expect(uiState.getState().activeServer).toBe('PonyServer'); // 激活服务器不应改变
  });
});
~~~~~

#### Acts 2: 找回爆发清理测试

修改 `tests/analysis.test.js`，添加遗失的 `cleanChannelRecords` 爆发检测逻辑。

~~~~~act
patch_file
tests/analysis.test.js
~~~~~
~~~~~javascript.old
    const report = generateStatisticsText(mockMessages, 'Local');
    expect(report).toContain('Local');
    expect(report).toContain('Alice');
  });
});
~~~~~
~~~~~javascript.new
    const report = generateStatisticsText(mockMessages, 'Local');
    expect(report).toContain('Local');
    expect(report).toContain('Alice');
  });

  it('cleanChannelRecords 应当能识别并在爆发期内清理重复项', () => {
    // 构造一个爆发期：1秒内有25条相同的消息
    const now = Date.now();
    const burstMessages = [];
    for (let i = 0; i < 25; i++) {
      burstMessages.push({
        content: 'SpamContent',
        time: new Date(now + i).toISOString(),
        is_historical: false,
        type: 'say',
      });
    }

    const { cleanedRecords, removedCount } = cleanChannelRecords(burstMessages);
    // 第一条保留，后续 24 条因为在爆发期内且内容重复，应当被删除
    expect(removedCount).toBe(24);
    expect(cleanedRecords.length).toBe(1);
    expect(cleanedRecords[0].content).toBe('SpamContent');
  });
});
~~~~~

#### Acts 3: 找回 V4 静默迁移测试

修改 `tests/migrations.test.js`，补充对 `migrateV4toV5` 的验证。

~~~~~act
patch_file
tests/migrations.test.js
~~~~~
~~~~~javascript.old
describe('migrations.js: Migration Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', () => {
~~~~~
~~~~~javascript.new
describe('migrations.js: Migration Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('V4 -> V5: 应当执行静默迁移并标准化时间戳', () => {
    const v4Data = {
      "Local": [{ time: "2023-10-01 12:00:00", content: "old_msg" }]
    };
    localStorage.setItem('chatLogArchive_v4', JSON.stringify(v4Data));
    
    MigrationManager.migrateV4toV5();
    
    const v5Data = JSON.parse(localStorage.getItem('chatLogArchive_v5'));
    expect(v5Data.Local[0].content).toBe("old_msg");
    // 验证时间戳已转为 ISO 格式（包含 T 和 Z）
    expect(v5Data.Local[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(localStorage.getItem('chatLogArchive_v4')).toBeNull();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', () => {
~~~~~

### 下一步建议
- **解析器性能测试**: 解析器针对 PUA 字符的判断使用了多次正则和码点计算，建议在 `tests/parser.test.js` 中增加一个包含 1000 条复杂消息的性能冒烟测试。
- **UI 渲染器测试**: 目前 `renderer.js` 的覆盖率为 0%，建议通过 `jsdom` 模拟必要的 DOM 结构，编写 `createRenderer` 的单元测试，验证例如服务器切换时下拉列表是否正确更新。
- **存储警告逻辑**: 测试 `utils.js` 中的存储占用计算逻辑是否与 `storage.js` 的原始大小获取一致。
