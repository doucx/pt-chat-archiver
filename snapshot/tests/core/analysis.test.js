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