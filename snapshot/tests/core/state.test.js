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