import { describe, expect, it } from 'vitest';
import { getSyntheticChannelName, mergeAndDeduplicateMessages } from '../src/state.js';

describe('state.js: mergeAndDeduplicateMessages', () => {
  const t = (s) => new Date(2023, 0, 1, 0, 0, s).toISOString();

  it('应当能合并有重叠的消息序列', () => {
    const oldMsgs = [
      { time: t(1), content: 'a' },
      { time: t(2), content: 'b' },
      { time: t(3), content: 'c' }
    ];
    const newMsgs = [
      { time: t(2), content: 'b' },
      { time: t(3), content: 'c' },
      { time: t(4), content: 'd' }
    ];
    const result = mergeAndDeduplicateMessages(oldMsgs, newMsgs);
    expect(result.map((m) => m.content)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('当没有重叠时，应当插入断层警告标记', () => {
    const oldMsgs = [{ time: t(1), content: 'a' }];
    const newMsgs = [{ time: t(10), content: 'z' }];
    const result = mergeAndDeduplicateMessages(oldMsgs, newMsgs);
    expect(result.length).toBe(3);
    expect(result[1].sender).toBe('Archiver');
  });
});

describe('state.js: Synthetic Channels', () => {
  it('应当正确识别需要复制到 Party-Local 频道的队伍消息', () => {
    const partyMsg = { type: 'party', content: 'team up!' };
    const result = getSyntheticChannelName(partyMsg, 'Local');
    expect(result).toBe('Party-Local');
  });

  it('非 Local 频道的队伍消息不应产生合成频道', () => {
    const partyMsg = { type: 'party', content: 'team up!' };
    const result = getSyntheticChannelName(partyMsg, 'Party');
    expect(result).toBeNull();
  });
});
