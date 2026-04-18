import { describe, expect, it } from 'vitest';
import { extractServerFromDOM, extractUsefulData, findActiveTabByClass } from '../src/parser.js';

describe('Parser Module', () => {
  describe('extractServerFromDOM', () => {
    it('应当能从带有 span 的按钮中提取服务器名', () => {
      document.body.innerHTML = '<button class="btn-success"><span> Safe Chinese </span></button>';
      expect(extractServerFromDOM()).toBe('Safe Chinese');
    });

    it('应当能通过 fallback 提取没有 span 的 Play on 按钮', () => {
      document.body.innerHTML = '<button class="btn-success">Play on Safe Chinese </button>';
      expect(extractServerFromDOM()).toBe('Safe Chinese');
    });

    it('如果没有目标按钮或匹配失败应返回 null', () => {
      document.body.innerHTML = '<button class="btn-primary">Other</button>';
      expect(extractServerFromDOM()).toBeNull();

      document.body.innerHTML = '<button class="btn-success">Invalid Text</button>';
      expect(extractServerFromDOM()).toBeNull();
    });
  });

  // 模拟窗口环境
  global.window = { location: { hostname: 'pony.town' } };

  it('应当能从 DOM 元素中解析普通发言', () => {
    const el = document.createElement('div');
    el.className = 'chat-line';
    el.innerHTML = `
      <span class="chat-line-timestamp">10:00</span>
      <span class="chat-line-name">[SenderName]</span>
      <span class="chat-line-message">Hello World</span>
    `;

    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('say');
    expect(data.sender).toBe('SenderName');
    // 确认 content 包含名称是符合预期的设计
    expect(data.content).toBe('[SenderName] Hello World');
  });

  it('应当能识别发出的私聊 (To ...)', () => {
    const el = document.createElement('div');
    // 模拟真实的真实 DOM：To 文本在 name 之前
    el.className = 'chat-line chat-line-whisper';
    el.innerHTML = `
      <span class="chat-line-timestamp">03:03</span>
      To <span class="chat-line-name">[UserB]</span>
      <span class="chat-line-message">晚好</span>
    `;

    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('whisper');
    expect(data.sender).toBe('Me');
    expect(data.receiver).toBe('UserB');
    expect(data.content).toBe('To [UserB] 晚好');
  });

  it('应当能识别收到的私聊 (... whispers:)', () => {
    const el = document.createElement('div');
    // 模拟真实的真实 DOM：whispers: 文本在 name 之后
    el.className = 'chat-line chat-line-whisper';
    el.innerHTML = `
      <span class="chat-line-timestamp">03:04</span>
      <span class="chat-line-name">[UserA]</span> whispers:
      <span class="chat-line-message">你好</span>
    `;

    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('whisper');
    expect(data.sender).toBe('UserA');
    expect(data.receiver).toBe('Me');
    expect(data.content).toBe('[UserA] whispers: 你好');
  });

  it('应当能解析包含 Emoji 图片的复杂名称', () => {
    const el = document.createElement('div');
    el.className = 'chat-line';
    // 使用单行字符串，避免 HTML 缩进引入多余空格
    el.innerHTML =
      '<span class="chat-line-name">[<span class="chat-line-name-content">UserA <img class="pixelart" alt="🌌"></span>]</span> <span class="chat-line-message">编程中</span>';

    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.sender).toBe('UserA 🌌');
    expect(data.content).toBe('[UserA 🌌] 编程中');
  });

  it('应当正确处理包含 PUA 字符的消息并回退到 aria-label', () => {
    const el = document.createElement('div');
    el.className = 'chat-line';
    // 模拟用户提供的片段:
    // 名称中的 🌌 (正常 Emoji) 应当保留
    // 消息中的  (PUA 字符 \ue519) 应当回退到 :face:
    el.innerHTML = `
      <span class="chat-line-name">[AyeL.neon(<img class="pixelart" aria-label="galaxy" alt="🌌">)]</span>
      <span class="chat-line-message"><img class="pixelart" aria-label="face" alt=""></span>
    `;

    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');

    // 验证名称解析：🌌 不是 PUA，直接提取 alt
    expect(data.sender).toBe('AyeL.neon(🌌)');

    // 验证消息解析： 是 PUA，应当提取 aria-label 并包裹冒号
    expect(data.content).toBe('[AyeL.neon(🌌)] :face:');
  });

  it('应当能解析系统重连等元消息', () => {
    const el = document.createElement('div');
    el.className = 'chat-line chat-line-meta-line';
    el.innerHTML = `
      <span class="chat-line-timestamp">03:01</span>
      <span class="chat-line-message">Rejoined</span>
    `;

    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('system');
    expect(data.sender).toBe('System');
    expect(data.content).toBe('Rejoined');
  });

  it('findActiveTabByClass 应当识别活跃标签页', () => {
    const html = `
      <div class="chat-log-tabs">
        <a class="chat-log-tab">Local</a>
        <a class="chat-log-tab active">Party</a>
      </div>
    `;
    expect(findActiveTabByClass(html)).toBe('Party');
  });
});
