import { describe, expect, it } from 'vitest';
import { getSyntheticChannelName, mergeAndDeduplicateMessages } from '../src/state.js';

describe('state.js: mergeAndDeduplicateMessages', () => {
  const t = (s) => new Date(2023, 0, 1, 0, 0, s).toISOString();

  it('应当能合并有重叠的消息序列', () => {
    const oldMsgs = [
      { time: t(1), content: 'a' },
      { time: t(2), content: 'b' },
      { time: t(3), content: 'c' },
    ];
    const newMsgs = [
      { time: t(2), content: 'b' },
      { time: t(3), content: 'c' },
      { time: t(4), content: 'd' },
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

describe('state.js: Zipper Merge Logic', () => {
  const t = (s) => new Date(2023, 0, 1, 0, 0, s).toISOString();

  it('应当精确在缺失处插入消息，且不改变已有消息的 ID 和顺序', () => {
    const oldMsgs = [
      { id: 'id_a', time: t(10), content: 'msg A', sender: 'Alice' },
      { id: 'id_c', time: t(30), content: 'msg C', sender: 'Charlie' },
    ];

    // 此时 DOM 扫描到了 A, B, C，说明 B 之前因为某种原因没被记录
    const newMsgs = [
      { time: t(10), content: 'msg A', sender: 'Alice' },
      { time: t(20), content: 'msg B', sender: 'Bob' },
      { time: t(30), content: 'msg C', sender: 'Charlie' },
    ];

    const result = mergeAndDeduplicateMessages(oldMsgs, newMsgs);

    expect(result.length).toBe(3);
    expect(result[0].content).toBe('msg A');
    expect(result[1].content).toBe('msg B');
    expect(result[2].content).toBe('msg C');

    // 核心验证：验证已有消息的 ID 绝对不被修改 (免疫级联重写 Bug)
    expect(result[0].id).toBe('id_a');
    expect(result[2].id).toBe('id_c');

    // 核心验证：验证插入消息获取了新的 ID，并基于前驱基准(A)进行了时间插值
    expect(result[1].id).toBeDefined();
    expect(new Date(result[1].time).getTime()).toBe(new Date(t(10)).getTime() + 1);
  });

  it('当新记录是旧记录的子集或重叠部分，应当直接返回旧记录而不作修改', () => {
    const oldMsgs = [
      { id: '1', content: 'a', sender: 'x' },
      { id: '2', content: 'b', sender: 'y' },
      { id: '3', content: 'c', sender: 'z' },
    ];
    // DOM 中之前的消息已被顶掉，只剩下后两条
    const newMsgs = [
      { content: 'b', sender: 'y' },
      { content: 'c', sender: 'z' },
    ];

    const result = mergeAndDeduplicateMessages(oldMsgs, newMsgs);
    // 验证引用完全相等，说明触发了快速返回，没有产生任何变更
    expect(result).toBe(oldMsgs);
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
