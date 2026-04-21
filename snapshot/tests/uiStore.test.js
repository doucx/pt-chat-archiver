import { beforeEach, describe, expect, it } from 'vitest';
import { storageManager } from '../src/storage/index.js';
import {
  initStore,
  viewMode,
  pageSize,
  updateConfig,
  viewingServer,
  activeServer,
  setRecordingStatus
} from '../src/ui/store/uiStore.js';

describe('ui/store/uiStore.js: UI State Manager Logic', () => {
  beforeEach(async () => {
    localStorage.clear();
    await storageManager.init();
  });

  it('状态初始化：应正确合并存储中的配置与默认值', async () => {
    localStorage.setItem('chatLogArchive_config', JSON.stringify({ pageSize: 50 }));
    await initStore();

    expect(pageSize.value).toBe(50);
    expect(viewMode.value).toBe('log');
  });

  it('持久化同步：修改配置应自动触发 localStorage 更新', async () => {
    await initStore();
    await updateConfig('pageSize', 200);

    const stored = JSON.parse(localStorage.getItem('chatLogArchive_config'));
    expect(stored.pageSize).toBe(200);
  });

  it('多服务器逻辑：查看服务器默认应跟随活动服务器', async () => {
    await initStore();

    setRecordingStatus('Server-A', 'Local');
    expect(viewingServer.value).toBe('Server-A');

    await updateConfig('autoFollowServer', false);
    viewingServer.value = 'Server-B';
    setRecordingStatus('Server-C', 'Local');
    
    expect(viewingServer.value).toBe('Server-B');
    expect(activeServer.value).toBe('Server-C');
  });
});