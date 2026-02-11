Excellent. You've correctly identified a critical step in the development workflow: running tests after a major refactoring. The test failures are not a setback; they are the expected and desired outcome of our safety net, and they point directly to the architectural change we just made.

Your analysis is spot on.

The root cause of all 12 test failures is identical: our new `StorageManager` has an **asynchronous initialization process**.

1.  **Old Sync Way**: `new StorageManager()` was enough. The adapter was created in the constructor.
2.  **New Async Way**: We must now explicitly call `await storageManager.init()` before using any of its methods. The `adapter` property is `undefined` until `init()` completes.
3.  **The Problem**: Our test suites (`*.test.js`) import the `storageManager` singleton and immediately start calling methods like `.getConfig()` or `.saveAllV6()` without ever calling `init()`. This results in the error `Cannot read properties of undefined (reading 'someMethod')` because it's trying to call `undefined.someMethod()`.

The solution is to update all affected test suites to properly initialize the `storageManager` within a `beforeEach` block. This ensures that for every single test, the manager is in a clean, ready state.

I will now generate a plan to fix all failing tests.

## [WIP] fix(tests): Initialize StorageManager before each test run

### 用户需求
The test suite is failing after the `StorageManager` was refactored to use asynchronous initialization. The tests need to be updated to correctly `await` the initialization before executing test logic.

### 评论
This is a necessary and healthy step in a major refactor. Fixing the test suite validates that our new asynchronous, adapter-based architecture is fundamentally sound and behaves as expected, paving the way for the final migration logic.

### 目标
1.  Modify `tests/storage.test.js` to initialize `storageManager` before each test.
2.  Modify `tests/ui_state.test.js` to initialize `storageManager` before each test.
3.  Modify `tests/ui.integration.test.js` to initialize `storageManager` before each UI render.
4.  Modify `tests/migrations.test.js` to initialize `storageManager` before its methods are implicitly called.

### 基本原理
By using `vitest`'s `beforeEach` hook in each test file, we can ensure that `await storageManager.init()` is called and completes before any test case within that file is executed. This guarantees that `storageManager.adapter` is always defined during test execution, resolving the widespread `TypeError`.

### 标签
#intent/fix #flow/ready #priority/critical #comp/tests #concept/dx #scope/core #ai/instruct #task/domain/storage #task/object/indexeddb-adapter #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: Fix `storage.test.js`

~~~~~act
patch_file
tests/storage.test.js
~~~~~
~~~~~javascript.old
describe('Storage Module (Async Manager)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('应当能正确保存和读取 V6 消息数据', async () => {
~~~~~
~~~~~javascript.new
describe('Storage Module (Async Manager)', () => {
  beforeEach(async () => {
    localStorage.clear();
    // Vitest's jsdom env doesn't have a real indexedDB, but it has a mock that supports the API.
    // We must initialize the manager to get an adapter instance.
    await storageManager.init();
  });

  it('应当能正确保存和读取 V6 消息数据', async () => {
~~~~~

#### Acts 2: Fix `ui_state.test.js`

~~~~~act
patch_file
tests/ui_state.test.js
~~~~~
~~~~~javascript.old
describe('ui/state.js: UI State Manager Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('状态初始化：应正确合并存储中的配置与默认值', async () => {
~~~~~
~~~~~javascript.new
import { storageManager } from '../src/storage';

describe('ui/state.js: UI State Manager Logic', () => {
  beforeEach(async () => {
    localStorage.clear();
    await storageManager.init();
  });

  it('状态初始化：应正确合并存储中的配置与默认值', async () => {
~~~~~

#### Acts 3: Fix `ui.integration.test.js`

The integration test has a helper function `renderUI` which calls `createUI`. `createUI` internally depends on `storageManager`. We need to ensure initialization happens before `renderUI` is called.

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
import { storageManager } from '../src/storage';

describe('UI Integration Smoke Tests', () => {
  let mockAppState;

  beforeEach(async () => {
    await storageManager.init();
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
~~~~~

#### Acts 4: Fix `migrations.test.js`

This one is failing because `migrateV5toV6` calls `storageManager.saveAllV6`, which needs an adapter.

~~~~~act
patch_file
tests/migrations.test.js
~~~~~
~~~~~javascript.old
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY_V5, STORAGE_KEY_V6 } from '../src/constants.js';
import { MigrationManager } from '../src/migrations.js';

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
~~~~~javascript.new
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY_V5 } from '../src/constants.js';
import { MigrationManager } from '../src/migrations.js';
import { storageManager } from '../src/storage/index.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(async () => {
    localStorage.clear();
    // The migration functions call storageManager methods, so it must be initialized.
    await storageManager.init();
  });

  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', async () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    const currentV6 = {};

    // Mock the IndexedDBAdapter's save method to write to localStorage for this test
    storageManager.adapter.saveAllV6 = (state) => {
      localStorage.setItem('MIGRATION_TEST_DB', JSON.stringify(state));
      return Promise.resolve();
    };

    const result = await MigrationManager.migrateV5toV6(v5Data, 'Main Server', currentV6);

    expect(result['Main Server'].Local[0].content).toBe('msg');

    const storedV6 = JSON.parse(localStorage.getItem('MIGRATION_TEST_DB'));
    expect(storedV6['Main Server'].Local[0].content).toBe('msg');
    expect(localStorage.getItem(STORAGE_KEY_V5)).toBeNull();
  });
});
~~~~~

### 下一步建议

我们已经定位并修复了所有因异步初始化导致的测试失败。在执行完这个计划后，我们的测试套件应该会恢复到全绿状态，为我们进行最后一步——数据迁移——提供一个坚实、可靠的基础。

请确认此修复计划，执行后我们就可以信心满满地开始编写 **Step 4: 迁移逻辑**。
