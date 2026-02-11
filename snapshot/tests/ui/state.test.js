import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createUIState } from '../../src/ui/state.js';
import { storage } from '../../src/storage.js';

describe('ui/state.js: UI State Manager', () => {
  beforeEach(() => {
    localStorage.clear();
    // 模拟存储中的基础配置
    localStorage.setItem('chatLogArchive_config', JSON.stringify({ pageSize: 50, autoSaveInterval: 60 }));
  });

  it('应当能从存储中加载初始配置', () => {
    const uiState = createUIState();
    const state = uiState.getState();
    expect(state.pageSize).toBe(50);
    expect(state.autoSaveInterval).toBe(60);
  });

  it('分页逻辑应当正确处理边界', () => {
    const uiState = createUIState();
    uiState.setTotalPages(10);
    
    uiState.setPage(5);
    expect(uiState.getState().currentPage).toBe(5);
    
    uiState.setPage(999); // 超出上限
    expect(uiState.getState().currentPage).toBe(10);
    
    uiState.setPage(-1); // 低于下限
    expect(uiState.getState().currentPage).toBe(1);
  });

  it('应当能正确更新并保存配置', () => {
    const uiState = createUIState();
    uiState.setPageSize(200);
    expect(uiState.getState().pageSize).toBe(200);
    
    const storedConfig = JSON.parse(localStorage.getItem('chatLogArchive_config'));
    expect(storedConfig.pageSize).toBe(200);
  });

  it('应当正确处理服务器切换', () => {
    const uiState = createUIState();
    uiState.setActiveServer('Server A');
    expect(uiState.getState().activeServer).toBe('Server A');
    expect(uiState.getState().viewingServer).toBe('Server A'); // 首次设置时自动同步

    uiState.setViewingServer('Server B');
    expect(uiState.getState().viewingServer).toBe('Server B');
    expect(uiState.getState().activeServer).toBe('Server A'); // 查看服务器不改变活动服务器
  });
});