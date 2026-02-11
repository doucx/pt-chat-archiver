import { describe, expect, it } from 'vitest';
import {
  calculateHourlyActivity,
  calculateTopTalkers,
  cleanChannelRecords,
  generateStatisticsText
} from '../src/analysis.js';

describe('Analysis Module', () => {
  const mockMessages = [
    { sender: 'Alice', content: 'Hi', time: '2023-01-01T10:00:00Z', type: 'say' },
    { sender: 'Alice', content: 'How are you?', time: '2023-01-01T10:05:00Z', type: 'say' },
    { sender: 'Bob', content: 'Hello', time: '2023-01-01T11:00:00Z', type: 'say' },
    { sender: 'System', content: 'Welcome', time: '2023-01-01T11:00:00Z', type: 'system' },
  ];

  it('calculateTopTalkers 应当过滤系统消息', () => {
    const { data, total } = calculateTopTalkers(mockMessages);
    expect(total).toBe(3);
    expect(data[0].name).toBe('Alice');
  });

  it('calculateHourlyActivity 应当正确识别高峰小时 (时区中立)', () => {
    const { data } = calculateHourlyActivity(mockMessages);
    const expectedHour = new Date(mockMessages[0].time).getHours();
    expect(data.find((d) => d.hour === expectedHour).count).toBe(2);
  });

  it('generateStatisticsText 应当生成完整的报告文本', () => {
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