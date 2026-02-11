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
    expect(data.content).toBe('Hello World');
  });

  it('应当能识别发出的私聊 (To ...)', () => {
    const el = document.createElement('div');
    el.className = 'chat-line chat-line-whisper';
    el.innerHTML = `
      <span class="chat-line-name">[Target]</span>
      <span class="chat-line-message">To Target: private message</span>
    `;
    
    const data = extractUsefulData(el, 'Me', '2023-01-01T10:00:00Z');
    expect(data.type).toBe('whisper');
    expect(data.sender).toBe('Me');
    expect(data.receiver).toBe('Target');
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