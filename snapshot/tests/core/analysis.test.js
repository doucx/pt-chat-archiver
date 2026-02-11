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