测试失败的原因在于 `new Date().getHours()` 返回的是运行环境的**本地时间**，而测试用例中使用的是 `Z` (UTC) 时间字符串。如果测试运行器的时区不是 UTC（例如在中国是 CST, UTC+8），`10:00Z` 会被解析为 `18:00`，导致 `data.find(d => d.hour === 10)` 找不到节点。

我将生成一个计划来修复这个测试缺陷，并进一步提高分析模块的覆盖率。

## [WIP] fix: 修复时区敏感的测试用例并提升分析模块覆盖率

### 错误分析
测试 `calculateHourlyActivity 应当正确按小时统计` 失败。
**根本原因**: 源代码 `src/analysis.js` 使用 `getHours()`（本地时间），而测试数据使用 UTC 字符串。在非 UTC 时区的机器上运行测试时，小时数值会发生偏移，导致 `find` 函数返回 `undefined`。
**解决方案**: 在测试用例中动态计算预期的本地小时数，或者强制在测试中使用一致的时区处理方式。

### 用户需求
修复现有的测试失败问题，并补全 `src/analysis.js` 中尚未覆盖的函数（如 `generateStatisticsText`、`calculateTopTalkers` 的边缘情况等）。

### 评论
时区问题是单元测试中的经典陷阱。对于聊天记录工具，用户通常希望看到自己本地时间的统计，因此保留 `getHours()` 是合理的，但测试必须具备鲁棒性，能够适应不同的运行环境。

### 目标
1.  **修复测试失败**: 修改 `tests/core/analysis.test.js`，使其动态计算预期的小时数。
2.  **补全分析逻辑测试**: 覆盖 `generateStatisticsText` 函数，验证其生成的报告文本是否包含预期的关键字。
3.  **覆盖边缘情况**: 测试当消息列表为空或仅包含系统消息时，统计函数的表现。

### 基本原理
我们将通过 `new Date(isoString).getHours()` 在测试代码中获取与源代码逻辑一致的预期值。同时，我们将增加对 `generateStatisticsText` 的集成测试，确保它能正确调用底层的计算函数并格式化输出。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #concept/history #scope/dx #ai/refine #task/domain/testing #task/object/analysis-logic #task/action/bug-fix #task/state/continue

---

### Script

#### Acts 1: 修复并增强 `analysis.test.js`

我们将修复时区偏移导致的失败，并添加对报告生成逻辑的测试。

~~~~~act
patch_file
tests/core/analysis.test.js
~~~~~
~~~~~javascript.old
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
~~~~~javascript.new
import { calculateTopTalkers, calculateHourlyActivity, generateStatisticsText } from '../../src/analysis.js';

describe('analysis.js: Statistics Functions', () => {
  const t10 = '2024-01-01T10:00:00Z';
  const t11 = '2024-01-01T11:00:00Z';
  
  const mockMessages = [
    { sender: 'Alice', time: t10, content: 'hi' },
    { sender: 'Alice', time: '2024-01-01T10:05:00Z', content: 'hello' },
    { sender: 'Bob', time: t11, content: 'hey' },
    { sender: 'System', time: '2024-01-01T11:30:00Z', content: 'ignore' },
  ];

  it('calculateTopTalkers 应当正确计算用户比例并忽略系统消息', () => {
    const { data, total } = calculateTopTalkers(mockMessages);
    expect(total).toBe(3); // 只有 Alice 和 Bob 的消息被计入
    expect(data[0].name).toBe('Alice');
    expect(data[0].count).toBe(2);
  });

  it('calculateHourlyActivity 应当正确按小时统计 (时区中立)', () => {
    const { data } = calculateHourlyActivity(mockMessages);
    
    // 动态计算本地小时数以匹配运行环境
    const expectedHour10 = new Date(t10).getHours();
    const expectedHour11 = new Date(t11).getHours();

    const hour10Result = data.find(d => d.hour === expectedHour10);
    const hour11Result = data.find(d => d.hour === expectedHour11);

    expect(hour10Result.count).toBe(2);
    expect(hour11Result.count).toBe(2);
  });

  it('generateStatisticsText 应当生成包含关键字的报告', () => {
    const report = generateStatisticsText(mockMessages, 'TestChannel');
    expect(report).toContain('TestChannel');
    expect(report).toContain('Alice');
    expect(report).toContain('最活跃用户');
    expect(report).toContain('聊天峰值时间段');
  });

  it('当没有消息时应当返回提示信息', () => {
    expect(generateStatisticsText([], 'Empty')).toContain('没有记录');
  });
});
~~~~~

### 下一步建议
- **DOM 解析器边界测试**: `src/parser.js` 中还有处理 Emoji 图片和特殊 PUA 字符的逻辑未被完全覆盖，建议补充相关 HTML 片段的解析测试。
- **存储异常测试**: 模拟 `localStorage.setItem` 抛出 `QuotaExceededError` 的情况，验证 `storage.js` 是否有基础的降级或报错提示（当前代码中仅有 `console.error`）。
- **CI 集成**: 既然测试已经开始完善，建议在根目录添加 GitHub Actions 配置文件，实现自动化的测试检查。
