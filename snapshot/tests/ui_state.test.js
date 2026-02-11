import { beforeEach, describe, expect, it } from 'vitest';
import { createUIState } from '../src/ui/state.js';
import { storageManager } from '../src/storage/index.js';

describe('ui/state.js: UI State Manager Logic', () => {
  beforeEach(async () => {
    localStorage.clear();
    await storageManager.init(); // 确保测试前已初始化
  });

  it('状态初始化：应正确合并存储中的配置与默认值', async () => {
    localStorage.setItem('chatLogArchive_config', JSON.stringify({ pageSize: 50 }));
    const uiState = await createUIState();
    const state = uiState.getState();

    expect(state.pageSize).toBe(50); // 来自存储
    expect(state.autoSaveInterval).toBe(30); // 默认值
    expect(state.viewMode).toBe('log'); // 默认初始视图
  });

  it('分页逻辑：应严格限制页码在有效范围内', async () => {
    const uiState = await createUIState();
    uiState.setTotalPages(10);

    uiState.setPage(5);
    expect(uiState.getState().currentPage).toBe(5);

    uiState.setPage(11); // 越上界
    expect(uiState.getState().currentPage).toBe(10);

    uiState.setPage(0); // 越下界
    expect(uiState.getState().currentPage).toBe(1);
  });

  it('持久化同步：修改配置应自动触发 localStorage 更新', async () => {
    const uiState = await createUIState();

    await uiState.setPageSize(200);
    await uiState.setAutoSaveInterval(60);

    const stored = JSON.parse(localStorage.getItem('chatLogArchive_config'));
    expect(stored.pageSize).toBe(200);
    expect(stored.autoSaveInterval).toBe(60);
  });

  it('多服务器逻辑：查看服务器默认应跟随活动服务器', async () => {
    const uiState = await createUIState();

    // 初始设置活动服务器
    uiState.setActiveServer('Server-A');
    expect(uiState.getState().viewingServer).toBe('Server-A');

    // 手动切换查看服务器后，不再随活动服务器改变
    uiState.setViewingServer('Server-B');
    uiState.setActiveServer('Server-C');
    expect(uiState.getState().viewingServer).toBe('Server-B');
    expect(uiState.getState().activeServer).toBe('Server-C');
  });
});
