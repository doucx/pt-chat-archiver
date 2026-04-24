由于我们之前移除了 `MigrationManager` 并重命名了存储适配器中的 V6 相关方法，现有的测试脚本出现了断裂。我将清理并对齐所有测试用例。

### 变更概要：
1.  **删除过时测试**: 物理删除 `tests/migrations.test.js` 和 `tests/migrations_pipeline.test.js`。
2.  **方法名对齐**: 在 `tests/storage.test.js` 中将 `saveAllV6` 和 `loadAllV6` 替换为 `overwriteFullArchive` 和 `exportFullArchive`。
3.  **Mock 对齐**: 更新 `tests/ui.integration.test.js` 和 `tests/ui.clean_duplicates.test.js` 中的 Adapter Mock，以匹配新的方法名 `exportFullArchive`。

## [WIP] test: 清理并对齐迁移逻辑移除后的测试套件

### 错误分析
在重构存储层 API（重命名 `saveAllV6` 为 `overwriteFullArchive` 等）后，`tests/storage.test.js` 仍然在调用旧的方法名，导致 `TypeError: storageManager.saveAllV6 is not a function`。同时，已删除的 `migrations.js` 对应的测试文件依然存在，会导致测试运行器因找不到模块而报错。

### 用户需求
清理测试套件，移除与迁移逻辑相关的测试，并确保现有存储和 UI 测试与新的 Archive API 保持一致。

### 评论
测试的清理是重构的最后一步，确保了 CI/CD 管道能够再次变绿，并验证了重构后的 API 在逻辑上仍然稳健。

### 目标
1.  移除所有关于 `MigrationManager` 的测试文件。
2.  修复 `storage.test.js` 中的 API 调用。
3.  更新 UI 集成测试中的 Mock 对象，使其使用 `exportFullArchive` 替代 `getAllData`（因为 `main.js` 中 `getAllData` 的内部实现已更改）。

### 基本原理
测试必须真实反映当前的系统架构。既然迁移功能已经移除，相关的测试就没有存在的意义。对于重命名的 API，我们需要更新所有测试调用点以确保测试通过。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #scope/core #ai/refine #task/domain/testing #task/object/test-cleanup #task/action/maintenance #task/state/end #task/status/completed

---

### Script

#### Acts 1: 删除已废弃的迁移测试

~~~~~act
delete_file
tests/migrations.test.js
~~~~~
~~~~~act
delete_file
tests/migrations_pipeline.test.js
~~~~~

#### Acts 2: 修复 Storage 模块测试

更新方法名以匹配 `src/storage/index.js` 中的新定义。

~~~~~act
patch_file
tests/storage.test.js
~~~~~
~~~~~javascript.old
  it('应当能正确保存和读取 V6 消息数据', async () => {
    await storageManager.init(); // 必须显式初始化
    const mockData = { 'Main Server': { Local: [{ content: 'hello' }] } };
    await storageManager.saveAllV6(mockData);
    const loadedData = await storageManager.loadAllV6();
    expect(loadedData).toEqual(mockData);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_V6))).toEqual(mockData);
  });
~~~~~
~~~~~javascript.new
  it('应当能正确保存和读取存档数据', async () => {
    await storageManager.init(); // 必须显式初始化
    const mockData = { 'Main Server': { Local: [{ content: 'hello' }] } };
    await storageManager.overwriteFullArchive(mockData);
    const loadedData = await storageManager.exportFullArchive();
    expect(loadedData).toEqual(mockData);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_V6))).toEqual(mockData);
  });
~~~~~
~~~~~act
patch_file
tests/storage.test.js
~~~~~
~~~~~javascript.old
  it('清空操作应当移除相关 key', async () => {
    await storageManager.init();
    await storageManager.saveAllV6({ a: 1 });
    await storageManager.clearAllData();
    const loadedData = await storageManager.loadAllV6();
    expect(loadedData).toEqual({});
  });
~~~~~
~~~~~javascript.new
  it('清空操作应当移除相关 key', async () => {
    await storageManager.init();
    await storageManager.overwriteFullArchive({ a: 1 });
    await storageManager.clearAllData();
    const loadedData = await storageManager.exportFullArchive();
    expect(loadedData).toEqual({});
  });
~~~~~

#### Acts 3: 修复 UI 集成测试中的 Mock

由于 `main.js` 中的 `dataAdapter.getAllData` 现在映射到了 `storageManager.exportFullArchive`，我们需要确保测试中的 Mock Adapter 也使用这个名称。

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
    return list.slice(startIndex, startIndex + limit);
  },
  getAllData: async () => state,
});

describe('UI Clean Duplicates Regression (V6)', () => {
~~~~~
~~~~~javascript.new
    return list.slice(startIndex, startIndex + limit);
  },
  exportFullArchive: async () => state,
});

describe('UI Clean Duplicates Regression', () => {
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
    return list.slice(startIndex, startIndex + limit);
  },
  getAllData: async () => state,
});

async function renderUI(initialState) {
~~~~~
~~~~~javascript.new
    return list.slice(startIndex, startIndex + limit);
  },
  exportFullArchive: async () => state,
});

async function renderUI(initialState) {
~~~~~

### 下一步建议
- **运行全量测试**: 执行 `npm test` 验证所有 69 个测试用例是否全部通过。
- **覆盖率审查**: 执行 `npm run test:coverage` 检查移除迁移逻辑后，存储层和 UI 层的代码覆盖率是否维持在健康水平。
- **环境检查**: 确保 `tests/storage/indexed-db.test.js` 中的 Mock 逻辑与 `IndexedDBAdapter` 中保留的方法（如 `exportFullArchive`）也保持一致。
