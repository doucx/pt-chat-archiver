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