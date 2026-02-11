import { describe, it, expect } from 'vitest';
import { extractUsefulData, findActiveTabByClass } from '../src/parser.js';

describe('Parser Module', () => {
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
    el.innerHTML = '<span class="chat-line-name">[<span class="chat-line-name-content">UserA <img class="pixelart" alt="🌌"></span>]</span> <span class="chat-line-message">编程中</span>';
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.sender).toBe('UserA 🌌');
    expect(data.content).toBe('[UserA 🌌] 编程中');
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