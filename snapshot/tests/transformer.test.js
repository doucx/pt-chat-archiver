import { describe, expect, it } from 'vitest';
import { flattenV6State, nestV7Messages } from '../src/data/transformer.js';

describe('Data Transformer (V6 <-> V7)', () => {
  describe('flattenV6State', () => {
    it('处理正常嵌套数据', () => {
      const v6 = {
        Server1: {
          ChannelA: [
            { content: 'hello', time: 't1' },
            { content: 'world', time: 't2' },
          ],
        },
      };
      const flat = flattenV6State(v6);
      expect(flat).toHaveLength(2);
      expect(flat[0]).toEqual({
        content: 'hello',
        time: 't1',
        server: 'Server1',
        channel: 'ChannelA',
      });
      expect(flat[1].server).toBe('Server1');
    });

    it('处理空输入或非法输入', () => {
      expect(flattenV6State(null)).toEqual([]);
      expect(flattenV6State(undefined)).toEqual([]);
      expect(flattenV6State({})).toEqual([]);
    });

    it('跳过非数组的消息容器', () => {
      const v6 = { S: { C: 'not-an-array' } };
      expect(flattenV6State(v6)).toEqual([]);
    });
  });

  describe('nestV7Messages', () => {
    it('处理正常的扁平数组', () => {
      const flat = [
        { content: 'msg1', server: 'S1', channel: 'C1', extra: 'foo' },
        { content: 'msg2', server: 'S1', channel: 'C1' },
        { content: 'msg3', server: 'S2', channel: 'C2' },
      ];
      const nested = nestV7Messages(flat);

      expect(nested.S1.C1).toHaveLength(2);
      expect(nested.S2.C2).toHaveLength(1);
      // 检查字段剥离：嵌套结果中不应包含冗余的 server/channel 字段
      expect(nested.S1.C1[0].server).toBeUndefined();
      expect(nested.S1.C1[0].extra).toBe('foo');
    });

    it('处理非数组输入', () => {
      expect(nestV7Messages(null)).toEqual({});
      expect(nestV7Messages('invalid')).toEqual({});
    });

    it('应当过滤掉缺少 server 或 channel 字段的损坏记录', () => {
      const flat = [
        { content: 'good', server: 'S1', channel: 'C1' },
        { content: 'bad', server: 'S1' }, // 缺少 channel
        { content: 'ugly', channel: 'C1' }, // 缺少 server
      ];
      const nested = nestV7Messages(flat);
      expect(nested.S1.C1).toHaveLength(1);
      expect(nested.S1.C1[0].content).toBe('good');
    });
  });
});
