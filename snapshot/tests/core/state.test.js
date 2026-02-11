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

describe('state.js: Synthetic Channels', () => {
  it('应当将队伍消息复制到 Party-Local 频道', () => {
    const { addMessageToSyntheticChannelIfNeeded } = require('../../src/state.js');
    const channelMap = { 'Local': [] };
    const partyMsg = { type: 'party', content: 'team up!' };
    
    addMessageToSyntheticChannelIfNeeded(channelMap, partyMsg, 'Local');
    
    expect(channelMap['Party-Local']).toBeDefined();
    expect(channelMap['Party-Local'][0].content).toBe('team up!');
  });

  it('非 Local 频道的消息不应触发合成', () => {
    const { addMessageToSyntheticChannelIfNeeded } = require('../../src/state.js');
    const channelMap = { 'Party': [] };
    const partyMsg = { type: 'party', content: 'inner msg' };
    
    addMessageToSyntheticChannelIfNeeded(channelMap, partyMsg, 'Party');
    expect(channelMap['Party-Local']).toBeUndefined();
  });
});