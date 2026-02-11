import { describe, expect, it } from 'vitest';
import { formatISOTimeForDisplay } from '../src/utils.js';

describe('Utils: formatISOTimeForDisplay', () => {
  it('应当正确格式化标准的 ISO 字符串', () => {
    const isoString = '2023-10-27T10:30:00.000Z';
    // 注意：格式化结果取决于运行测试的环境时区。
    // 这里我们检查基本的格式结构
    const result = formatISOTimeForDisplay(isoString);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('当输入为空或 undefined 时应当返回 N/A', () => {
    expect(formatISOTimeForDisplay(null)).toBe('N/A');
    expect(formatISOTimeForDisplay(undefined)).toBe('N/A');
    expect(formatISOTimeForDisplay('')).toBe('N/A');
  });

  it('当输入非法日期字符串时应当返回 "日期无效"', () => {
    expect(formatISOTimeForDisplay('not-a-date')).toBe('日期无效');
  });
});
