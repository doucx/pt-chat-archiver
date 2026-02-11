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
});