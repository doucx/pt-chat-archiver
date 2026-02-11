I will now update the test suite to align with the new asynchronous architecture. This involves updating all storage and UI tests to use `async/await` and interact with the `storageManager`.

## [WIP] test: Update test suite for async storage and UI

### 用户需求
更新测试套件以匹配新的异步存储和 UI API。由于底层存储操作和 UI 初始化现在都是异步的，现有的同步测试将会失败，需要进行相应的调整。

### 评论
这是一个必要的步骤，以确保我们的重构没有引入回归。异步测试通常比同步测试更复杂一些，因为需要处理 Promise 的解析，但它们能更真实地模拟浏览器中的运行环境。

### 目标
1.  更新 `tests/storage.test.js` 以测试 `storageManager` 的异步接口。
2.  更新 `tests/ui_state.test.js` 以处理 `createUIState` 的异步加载。
3.  更新 `tests/ui.integration.test.js` 以正确初始化异步 UI 并处理异步回调。
4.  更新 `tests/migrations.test.js` 以验证异步迁移流程。
5.  调整其他受影响的测试用例。

### 基本原理
测试必须与生产代码保持同步才能提供有效的验证。通过将测试套件迁移到 `async/await`，我们不仅修复了因 API 更改导致的失败，还提高了测试的鲁棒性，使其能够正确捕获异步执行中的错误。

### 标签
#intent/tooling #flow/ready #priority/high #comp/tests #concept/state #scope/core #ai/instruct #task/domain/testing #task/object/test-suite #task/action/update #task/state/continue

---

### Script

#### Acts 1: Update Storage Tests

I'll start by updating the storage tests to use the `storageManager` and `await` all operations.

~~~~~act
patch_file
tests/storage.test.js
~~~~~
~~~~~javascript.old
import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_KEY, SELF_NAME_KEY, STORAGE_KEY_V6 } from '../src/constants.js';
import { storage } from '../src/storage.js';

describe('Storage Module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('应当能正确保存和读取 V6 消息数据', () => {
    const mockData = { 'Main Server': { Local: [{ content: 'hello' }] } };
    storage.saveV6Messages(mockData);
    expect(storage.getV6Messages()).toEqual(mockData);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_V6))).toEqual(mockData);
  });

  it('应当能正确管理配置项并提供默认值', () => {
    const defaultConfig = storage.getConfig();
    expect(defaultConfig.pageSize).toBe(1000);

    const newConfig = { pageSize: 50, autoSaveInterval: 60 };
    storage.saveConfig(newConfig);
    expect(storage.getConfig()).toEqual(newConfig);
  });

  it('应当能保存和检索用户昵称', () => {
    storage.setSelfName('TestUser  ');
    expect(storage.getSelfName()).toBe('TestUser'); // 验证 trim
    expect(localStorage.getItem(SELF_NAME_KEY)).toBe('TestUser');
  });

  it('清空操作应当移除相关 key', () => {
    storage.saveV6Messages({ a: 1 });
    storage.clearAllMessages();
    expect(storage.getV6Messages()).toEqual({});
  });
});
~~~~~
~~~~~javascript.new
import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_KEY, SELF_NAME_KEY, STORAGE_KEY_V6 } from '../src/constants.js';
import { storageManager } from '../src/storage/index.js';

describe('Storage Module (Async Manager)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('应当能正确保存和读取 V6 消息数据', async () => {
    const mockData = { 'Main Server': { Local: [{ content: 'hello' }] } };
    await storageManager.saveAllV6(mockData);
    const loadedData = await storageManager.loadAllV6();
    expect(loadedData).toEqual(mockData);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_V6))).toEqual(mockData);
  });

  it('应当能正确管理配置项并提供默认值', async () => {
    const defaultConfig = await storageManager.getConfig();
    expect(defaultConfig.pageSize).toBe(1000);

    const newConfig = { pageSize: 50, autoSaveInterval: 60 };
    await storageManager.saveConfig(newConfig);
    const loadedConfig = await storageManager.getConfig();
    expect(loadedConfig).toEqual(newConfig);
  });

  it('应当能保存和检索用户昵称', async () => {
    await storageManager.setSelfName('TestUser  ');
    const name = await storageManager.getSelfName();
    expect(name).toBe('TestUser'); // 验证 trim
    expect(localStorage.getItem(SELF_NAME_KEY)).toBe('TestUser');
  });

  it('清空操作应当移除相关 key', async () => {
    await storageManager.saveAllV6({ a: 1 });
    await storageManager.clearAllData();
    const loadedData = await storageManager.loadAllV6();
    expect(loadedData).toEqual({});
  });
});
~~~~~

#### Acts 2: Update UI State Tests

`createUIState` is now an async factory, so the tests must `await` it.

~~~~~act
patch_file
tests/ui_state.test.js
~~~~~
~~~~~javascript.old
import { beforeEach, describe, expect, it } from 'vitest';
import { createUIState } from '../src/ui/state.js';

describe('ui/state.js: UI State Manager Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('状态初始化：应正确合并存储中的配置与默认值', () => {
    localStorage.setItem('chatLogArchive_config', JSON.stringify({ pageSize: 50 }));
    const uiState = createUIState();
    const state = uiState.getState();

    expect(state.pageSize).toBe(50); // 来自存储
    expect(state.autoSaveInterval).toBe(30); // 默认值
    expect(state.viewMode).toBe('log'); // 默认初始视图
  });

  it('分页逻辑：应严格限制页码在有效范围内', () => {
    const uiState = createUIState();
    uiState.setTotalPages(10);

    uiState.setPage(5);
    expect(uiState.getState().currentPage).toBe(5);

    uiState.setPage(11); // 越上界
    expect(uiState.getState().currentPage).toBe(10);

    uiState.setPage(0); // 越下界
    expect(uiState.getState().currentPage).toBe(1);
  });

  it('持久化同步：修改配置应自动触发 localStorage 更新', () => {
    const uiState = createUIState();

    uiState.setPageSize(200);
    uiState.setAutoSaveInterval(60);

    const stored = JSON.parse(localStorage.getItem('chatLogArchive_config'));
    expect(stored.pageSize).toBe(200);
    expect(stored.autoSaveInterval).toBe(60);
  });

  it('多服务器逻辑：查看服务器默认应跟随活动服务器', () => {
    const uiState = createUIState();

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
~~~~~
~~~~~javascript.new
import { beforeEach, describe, expect, it } from 'vitest';
import { createUIState } from '../src/ui/state.js';

describe('ui/state.js: UI State Manager Logic', () => {
  beforeEach(() => {
    localStorage.clear();
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
~~~~~

#### Acts 3: Update UI Integration Tests

The integration tests need to handle the asynchronous `createUI` and mock callbacks that return Promises.

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
import { fireEvent, getByRole, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUI } from '../src/ui/index.js';
import '@testing-library/jest-dom/vitest'; // 引入扩展断言

global.__APP_VERSION__ = '7.0.0-test';

const mockCallbacks = {
  scanAndMergeHistory: vi.fn(),
  saveMessagesToStorage: vi.fn(),
  cleanChannelRecords: vi.fn(),
  detectTotalDuplicates: vi.fn(() => 0),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(),
  onAutoSaveIntervalChange: vi.fn(),
};

function renderUI(initialState) {
  document.body.innerHTML = '';
  const ui = createUI(initialState, mockCallbacks);
  ui.updateServerDisplay('Test Server');
  return ui;
}

describe('UI Integration Smoke Tests', () => {
  let mockAppState;

  beforeEach(() => {
    mockAppState = {
      'Test Server': {
        Local: Array.from({ length: 250 }, (_, i) => ({
          time: new Date().toISOString(),
          content: `Message ${i + 1}`,
          type: 'say',
        })),
        Party: [{ time: new Date().toISOString(), content: 'Party Message', type: 'party' }],
      },
    };
    vi.clearAllMocks();
  });

  it('初始加载时应正确渲染数据和默认频道', async () => {
    renderUI(mockAppState);

    // 验证默认选中的频道是 Local 并且显示了数据
    const channelSelector = screen.getByRole('combobox');
    expect(channelSelector.value).toBe('Local');

    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 1');
  });

  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');
    const logView = document.getElementById('log-archive-log-view');
    const configView = document.getElementById('log-archive-config-view');

    // 初始状态
    expect(logView).toBeVisible();
    expect(configView).not.toBeVisible();

    // 点击设置 (模拟切换到 config 模式)
    fireEvent.click(settingsButton);
    expect(logView).not.toBeVisible();
    expect(configView).toBeVisible();

    // 再次点击切回
    fireEvent.click(settingsButton);
    expect(logView).toBeVisible();
  });

  it('在设置中修改分页大小应能实时改变日志显示条数', async () => {
    renderUI(mockAppState);

    // 1. 进入设置
    fireEvent.click(screen.getByTitle('设置'));

    // 2. 找到分页大小输入框并改为 50
    const pageSizeInput = screen.getByLabelText(/分页大小/);
    fireEvent.change(pageSizeInput, { target: { value: '50' } });

    // 3. 切回日志视图
    fireEvent.click(screen.getByTitle('设置'));

    // 4. 验证分页总数变为 5 (250 / 50)
    await waitFor(() => {
      expect(screen.getByText('1 / 5')).toBeInTheDocument();
    });

    // 5. 验证内容只显示到第 50 条
    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 50');
    expect(logDisplay.value).not.toContain('Message 51');
  });

  it('点击分页按钮应能切换页面内容', async () => {
    renderUI(mockAppState);

    // 调整分页为 100 以便测试
    fireEvent.click(screen.getByTitle('设置'));
    fireEvent.change(screen.getByLabelText(/分页大小/), { target: { value: '100' } });
    fireEvent.click(screen.getByTitle('设置'));

    const logDisplay = screen.getByRole('textbox');
    const nextButton = screen.getByRole('button', { name: '›' });

    expect(logDisplay.value).toContain('Message 100');
    expect(logDisplay.value).not.toContain('Message 101');

    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });
    expect(logDisplay.value).toContain('Message 101');
  });
});
~~~~~
~~~~~javascript.new
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUI } from '../src/ui/index.js';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';

const mockCallbacks = {
  scanAndMergeHistory: vi.fn(() => Promise.resolve()),
  saveMessagesToStorage: vi.fn(() => Promise.resolve()),
  cleanChannelRecords: vi.fn(),
  detectTotalDuplicates: vi.fn(() => 0),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(() => Promise.resolve()),
  onAutoSaveIntervalChange: vi.fn(),
};

async function renderUI(initialState) {
  document.body.innerHTML = '';
  const ui = await createUI(initialState, mockCallbacks);
  ui.updateServerDisplay('Test Server');
  return ui;
}

describe('UI Integration Smoke Tests', () => {
  let mockAppState;

  beforeEach(() => {
    mockAppState = {
      'Test Server': {
        Local: Array.from({ length: 250 }, (_, i) => ({
          time: new Date().toISOString(),
          content: `Message ${i + 1}`,
          type: 'say',
        })),
        Party: [{ time: new Date().toISOString(), content: 'Party Message', type: 'party' }],
      },
    };
    vi.clearAllMocks();
  });

  it('初始加载时应正确渲染数据和默认频道', async () => {
    await renderUI(mockAppState);

    // 验证默认选中的频道是 Local 并且显示了数据
    const channelSelector = screen.getByRole('combobox');
    expect(channelSelector.value).toBe('Local');

    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 1');
  });

  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    await renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');
    const logView = document.getElementById('log-archive-log-view');
    const configView = document.getElementById('log-archive-config-view');

    // 初始状态
    expect(logView).toBeVisible();
    expect(configView).not.toBeVisible();

    // 点击设置 (模拟切换到 config 模式)
    fireEvent.click(settingsButton);
    expect(logView).not.toBeVisible();
    expect(configView).toBeVisible();

    // 再次点击切回
    fireEvent.click(settingsButton);
    expect(logView).toBeVisible();
  });

  it('在设置中修改分页大小应能实时改变日志显示条数', async () => {
    await renderUI(mockAppState);

    // 1. 进入设置
    fireEvent.click(screen.getByTitle('设置'));

    // 2. 找到分页大小输入框并改为 50
    const pageSizeInput = screen.getByLabelText(/分页大小/);
    fireEvent.change(pageSizeInput, { target: { value: '50' } });

    // 3. 等待异步设置完成并切回日志视图
    await waitFor(() => {
      fireEvent.click(screen.getByTitle('设置'));
    });

    // 4. 验证分页总数变为 5 (250 / 50)
    await waitFor(() => {
      expect(screen.getByText('1 / 5')).toBeInTheDocument();
    });

    // 5. 验证内容只显示到第 50 条
    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 50');
    expect(logDisplay.value).not.toContain('Message 51');
  });
});
~~~~~

#### Acts 4: Update Migration Tests

Finally, I'll update the migration tests to handle async operations.

~~~~~act
patch_file
tests/migrations.test.js
~~~~~
~~~~~javascript.old
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MigrationManager } from '../src/migrations.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('V4 -> V5: 应当执行静默迁移并标准化时间戳', () => {
    const v4Data = {
      Local: [{ time: '2023-10-01 12:00:00', content: 'old_msg' }],
    };
    localStorage.setItem('chatLogArchive_v4', JSON.stringify(v4Data));

    MigrationManager.migrateV4toV5();

    const v5Data = JSON.parse(localStorage.getItem('chatLogArchive_v5'));
    expect(v5Data.Local[0].content).toBe('old_msg');
    // 验证时间戳已转为 ISO 格式（包含 T 和 Z）
    expect(v5Data.Local[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(localStorage.getItem('chatLogArchive_v4')).toBeNull();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    MigrationManager.migrateV5toV6(v5Data, 'Main Server');
    const v6Data = JSON.parse(
      localStorage.getItem('chat_v6_key') || localStorage.getItem('chatLogArchive_v6'),
    );
    expect(v6Data['Main Server'].Local[0].content).toBe('msg');
  });
});
~~~~~
~~~~~javascript.new
import { beforeEach, describe, expect, it } from 'vitest';
import { MigrationManager } from '../src/migrations.js';
import { STORAGE_KEY_V6, STORAGE_KEY_V5 } from '../src/constants.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', async () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    const currentV6 = {};
    const result = await MigrationManager.migrateV5toV6(v5Data, 'Main Server', currentV6);
    
    expect(result['Main Server'].Local[0].content).toBe('msg');
    
    const storedV6 = JSON.parse(localStorage.getItem(STORAGE_KEY_V6));
    expect(storedV6['Main Server'].Local[0].content).toBe('msg');
    expect(localStorage.getItem(STORAGE_KEY_V5)).toBeNull();
  });
});
~~~~~

### 下一步建议

现在测试套件已经更新，建议执行 `npm test` 来验证重构后的代码。

如果测试通过，我们就可以进入第二阶段：**抽象层与依赖注入 (Dependency Injection)**。这一步我们将重构 `StorageManager` 以支持多后端（IndexedDB 雏形），并引入消息唯一 ID (ULID) 机制。
