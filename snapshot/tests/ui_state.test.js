import { describe, it, expect, beforeEach } from 'vitest';
import { createUIState } from '../src/ui/state.js';

describe('ui/state.js: UI State Manager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('应当能从存储中加载初始配置并处理默认值', () => {
    localStorage.setItem('chatLogArchive_config', JSON.stringify({ pageSize: 50 }));
    const uiState = createUIState();
    expect(uiState.getState().pageSize).toBe(50);
    expect(uiState.getState().autoSaveInterval).toBe(30); // 默认值
  });

  it('分页逻辑应当正确处理越界情况', () => {
    const uiState = createUIState();
    uiState.setTotalPages(5);
    
    uiState.setPage(3);
    expect(uiState.getState().currentPage).toBe(3);
    
    uiState.setPage(10); // 超过最大页
    expect(uiState.getState().currentPage).toBe(5);
    
    uiState.setPage(0); // 小于最小页
    expect(uiState.getState().currentPage).toBe(1);
  });

  it('修改配置应当同步到本地存储', () => {
    const uiState = createUIState();
    uiState.setPageSize(200);
    const stored = JSON.parse(localStorage.getItem('chatLogArchive_config'));
    expect(stored.pageSize).toBe(200);
  });

  it('应当正确处理服务器激活与查看逻辑', () => {
    const uiState = createUIState();
    uiState.setActiveServer('PonyServer');
    expect(uiState.getState().activeServer).toBe('PonyServer');
    expect(uiState.getState().viewingServer).toBe('PonyServer'); // 初始应跟随

    uiState.setViewingServer('OldArchive');
    expect(uiState.getState().viewingServer).toBe('OldArchive');
    expect(uiState.getState().activeServer).toBe('PonyServer'); // 激活服务器不应改变
  });
});