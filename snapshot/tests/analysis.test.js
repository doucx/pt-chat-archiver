import { describe, expect, it } from 'vitest';
import {
  calculateHourlyActivity,
  calculateTopTalkers,
  cleanChannelRecords,
} from '../src/analysis.js';

describe('Analysis Module', () => {
  const mockMessages = [
    { sender: 'Alice', content: 'Hi', time: '2023-01-01T10:00:00Z', type: 'say' },
    { sender: 'Alice', content: 'How are you?', time: '2023-01-01T10:05:00Z', type: 'say' },
    { sender: 'Bob', content: 'Hello', time: '2023-01-01T11:00:00Z', type: 'say' },
    { sender: 'System', content: 'Welcome', time: '2023-01-01T11:00:00Z', type: 'system' },
  ];

  it('calculateTopTalkers 应当正确计算用户发言权重并过滤系统消息', () => {
    const { data, total } = calculateTopTalkers(mockMessages);
    expect(total).toBe(3);
    expect(data[0].name).toBe('Alice');
    expect(data[0].count).toBe(2);
  });

  it('calculateHourlyActivity 应当正确识别高峰小时', () => {
    const { data } = calculateHourlyActivity(mockMessages);
    const expectedHour = new Date(mockMessages[0].time).getHours();
    expect(data.find((d) => d.hour === expectedHour).count).toBe(2);
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
        type: 'say',
      });
    }

    const { cleanedRecords, removedCount } = cleanChannelRecords(burstMessages);
    // 第一条会保留（作为内容源），后续重复且在爆发期内的会被删
    expect(removedCount).toBeGreaterThan(0);
    expect(cleanedRecords.length).toBeLessThan(25);
  });
});
