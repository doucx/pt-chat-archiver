import { describe, it, expect } from 'vitest';
import { mergeAndDeduplicateMessages, addMessageToSyntheticChannelIfNeeded } from '../src/state.js';

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
    expect(result.length).toBe(3);
    expect(result[1].sender).toBe('Archiver');
  });
});

describe('state.js: Synthetic Channels', () => {
  it('应当将队伍消息复制到 Party-Local 频道', () => {
    const channelMap = { 'Local': [] };
    const partyMsg = { type: 'party', content: 'team up!' };
    addMessageToSyntheticChannelIfNeeded(channelMap, partyMsg, 'Local');
    expect(channelMap['Party-Local'][0].content).toBe('team up!');
  });
});