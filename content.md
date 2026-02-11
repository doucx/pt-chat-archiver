这是一个典型的重构副作用。由于 `StorageManager` 变成了异步初始化，且在 `init()` 被调用前 `adapter` 为 `null`，现有的测试和部分业务逻辑因为直接访问了未初始化的单例而崩溃。

我们需要确保在所有入口点（包括测试）都首先完成 `storageManager.init()`。

## [WIP] fix: 修复存储管理器异步化导致的测试崩溃

### 错误分析
在 Step 3 的重构中，我们将 `StorageManager` 的构造函数逻辑移到了异步的 `init()` 方法中。
1.  **单元测试**: `ui_state.test.js` 和 `ui.integration.test.js` 在测试设置阶段直接调用了依赖 `storageManager` 的函数（如 `createUIState`），但没有预先调用 `await storageManager.init()`。
2.  **迁移逻辑**: `migrations.js` 内部直接引用了全局 `storageManager` 实例进行 `saveAllV6` 等操作，如果迁移在初始化完成前触发，就会报错。
3.  **单体测试隔离**: 多个测试文件共享同一个 `storageManager` 单例，如果一个测试没有初始化它，就会导致失败。

### 目标
1.  更新所有受影响的测试文件，在 `beforeEach` 或测试开始前确保 `storageManager` 已初始化。
2.  增强 `StorageManager` 的鲁棒性，确保 `init` 逻辑不会因为多次调用而产生副作用。

### 标签
#intent/fix #flow/ready #priority/critical #comp/tests #concept/storage #scope/core #ai/instruct #task/domain/testing #task/object/async-initialization #task/action/fix

---

### Script

#### Acts 1: 增强 `StorageManager` 的鲁棒性

防止重复初始化，并允许在不传递参数时保持现有适配器。

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~python.old
  async init(useIndexedDB = false) {
    // 策略：如果明确要求使用 IDB，或者未来通过配置决定
    if (useIndexedDB) {
      this.adapter = new IndexedDBAdapter();
    } else {
      // 默认回退到 LocalStorage (当前阶段)
      this.adapter = new LocalStorageAdapter();
    }
    
    await this.adapter.init();
    console.info(`[StorageManager] Initialized with ${this.adapter.constructor.name}`);
  }
~~~~~
~~~~~python.new
  async init(useIndexedDB = false) {
    // 如果已经初始化过且没有强制切换，则直接返回
    if (this.adapter && !useIndexedDB) return;

    // 策略：如果明确要求使用 IDB，或者未来通过配置决定
    if (useIndexedDB) {
      this.adapter = new IndexedDBAdapter();
    } else {
      // 默认回退到 LocalStorage (当前阶段)
      this.adapter = new LocalStorageAdapter();
    }
    
    await this.adapter.init();
    console.info(`[StorageManager] Initialized with ${this.adapter.constructor.name}`);
  }
~~~~~

#### Acts 2: 修复 `ui_state.test.js`

~~~~~act
patch_file
tests/ui_state.test.js
~~~~~
~~~~~python.old
import { beforeEach, describe, expect, it } from 'vitest';
import { createUIState } from '../src/ui/state.js';

describe('ui/state.js: UI State Manager Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });
~~~~~
~~~~~python.new
import { beforeEach, describe, expect, it } from 'vitest';
import { createUIState } from '../src/ui/state.js';
import { storageManager } from '../src/storage/index.js';

describe('ui/state.js: UI State Manager Logic', () => {
  beforeEach(async () => {
    localStorage.clear();
    await storageManager.init(); // 确保测试前已初始化
  });
~~~~~

#### Acts 3: 修复 `migrations.test.js`

~~~~~act
patch_file
tests/migrations.test.js
~~~~~
~~~~~python.old
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY_V5, STORAGE_KEY_V6 } from '../src/constants.js';
import { MigrationManager } from '../src/migrations.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });
~~~~~
~~~~~python.new
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY_V5, STORAGE_KEY_V6 } from '../src/constants.js';
import { MigrationManager } from '../src/migrations.js';
import { storageManager } from '../src/storage/index.js';

describe('migrations.js: Migration Logic', () => {
  beforeEach(async () => {
    localStorage.clear();
    await storageManager.init();
  });
~~~~~

#### Acts 4: 修复 `ui.integration.test.js`

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~python.old
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUI } from '../src/ui/index.js';
import '@testing-library/jest-dom/vitest';
~~~~~
~~~~~python.new
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUI } from '../src/ui/index.js';
import { storageManager } from '../src/storage/index.js';
import '@testing-library/jest-dom/vitest';
~~~~~
~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~python.old
describe('UI Integration Smoke Tests', () => {
  let mockAppState;

  beforeEach(() => {
    mockAppState = {
~~~~~
~~~~~python.new
describe('UI Integration Smoke Tests', () => {
  let mockAppState;

  beforeEach(async () => {
    await storageManager.init();
    mockAppState = {
~~~~~

### 下一步建议
通过在测试中引入显式的 `await storageManager.init()`，我们解决了由于异步重构引起的测试崩溃。

接下来的 **Step 4** 我们可以安全地开始编写 `V6 -> V7` 的迁移逻辑。由于迁移涉及从 `LocalStorage` 读取并写入 `IndexedDB`，这种异步初始化的架构现在能够完美支撑这一过程（我们可以在 `init` 过程中无感地插入迁移步骤）。
