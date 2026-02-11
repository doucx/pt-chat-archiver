这个错误是因为我们在 `src/migrations.js` 中删除了 `storageManager` 的导入以避免循环依赖，但旧的 V5 -> V6 迁移逻辑仍然在尝试调用全局的 `storageManager`。

在 V7 架构下，我们应该让迁移逻辑保持“纯粹”，即通过参数接收它所需要的适配器或管理器，而不是依赖全局单例。

## [WIP] fix: 修复迁移逻辑中的循环依赖与引用错误

### 错误分析
1.  **循环依赖**: `src/storage/index.js` 导入了 `MigrationManager`，而 `src/migrations.js` 原本导入了 `storageManager`（位于 `src/storage/index.js`）。
2.  **引用错误**: 为了解决循环依赖，我之前删除了 `src/migrations.js` 中的导入，但遗漏了修改 `migrateV5toV6` 这个旧方法。
3.  **测试失败**: `tests/migrations.test.js` 直接调用了该方法，导致 `ReferenceError`。

### 目标
1.  重构 `src/migrations.js` 中的旧迁移方法，使其通过参数接收存储实例，彻底消除对全局单例的依赖。
2.  更新调用方（`main.js` 和 `tests`）。

### 标签
#intent/fix #flow/ready #priority/high #comp/engine #concept/migration #ai/instruct #task/domain/storage #task/object/migration-refactor #task/action/fix

---

### Script

#### Acts 1: 重构 `src/migrations.js` 以支持依赖注入

我们将修改旧的迁移方法，使其不再依赖全局 `storageManager`。

~~~~~act
patch_file
src/migrations.js
~~~~~
~~~~~javascript.old
  /**
   * v5 -> v6: 多服务器支持
   * v5 数据是全局单服务器的，v6 需要将其映射到具体的服务器。
   */
  async migrateV5toV6(v5Data, targetServer, currentV6Data) {
    console.log(`[Migration] 正在执行 V5 到 V6 迁移，目标服务器: ${targetServer}`);

    if (!currentV6Data[targetServer]) {
      // 如果目标服务器没数据，直接搬迁
      currentV6Data[targetServer] = v5Data;
    } else {
      // 如果已经有数据，则执行频道级的智能合并
      for (const channel in v5Data) {
        currentV6Data[targetServer][channel] = mergeAndDeduplicateMessages(
          currentV6Data[targetServer][channel] || [],
          v5Data[channel],
        );
      }
    }

    await storageManager.saveAllV6(currentV6Data);
    await storageManager.removeV5Data();
    console.info('[Migration] V5 -> V6 迁移完成，旧数据已移除。');
    return currentV6Data;
  },

  /**
   * 检查并触发交互式迁移
   * @param {string} serverName - 当前检测到的服务器名
   * @param {object} currentV6State - The current in-memory V6 state.
   * @param {Function} onMigrated - 迁移成功后的回调函数，用于更新内存状态和UI
   */
  async checkAndTriggerInteractiveMigrations(serverName, currentV6State, onMigrated) {
    if (!serverName) return;

    // 1. 处理 V5 -> V6
    const v5Data = await storageManager.loadAllV5();
    if (v5Data && Object.keys(v5Data).length > 0) {
~~~~~
~~~~~javascript.new
  /**
   * v5 -> v6: 多服务器支持
   * @param {object} storage - 存储实例 (StorageManager 或 Adapter)
   */
  async migrateV5toV6(storage, v5Data, targetServer, currentV6Data) {
    console.log(`[Migration] 正在执行 V5 到 V6 迁移，目标服务器: ${targetServer}`);

    if (!currentV6Data[targetServer]) {
      currentV6Data[targetServer] = v5Data;
    } else {
      for (const channel in v5Data) {
        currentV6Data[targetServer][channel] = mergeAndDeduplicateMessages(
          currentV6Data[targetServer][channel] || [],
          v5Data[channel],
        );
      }
    }

    await storage.saveAllV6(currentV6Data);
    await storage.removeV5Data();
    console.info('[Migration] V5 -> V6 迁移完成，旧数据已移除。');
    return currentV6Data;
  },

  /**
   * 检查并触发交互式迁移
   * @param {object} storage - 存储实例
   * @param {string} serverName - 当前检测到的服务器名
   * @param {object} currentV6State - 当前内存中的 V6 状态
   * @param {Function} onMigrated - 迁移成功后的回调函数
   */
  async checkAndTriggerInteractiveMigrations(storage, serverName, currentV6State, onMigrated) {
    if (!serverName) return;

    // 1. 处理 V5 -> V6
    const v5Data = await storage.loadAllV5();
    if (v5Data && Object.keys(v5Data).length > 0) {
~~~~~

#### Acts 2: 更新 `main.js` 中的调用

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
        // 3. 检查并触发交互式迁移 (如 v5 -> v6)
        await MigrationManager.checkAndTriggerInteractiveMigrations(
          server,
          inMemoryChatState,
          (newState) => {
            inMemoryChatState = newState;
            uiControls.setState(inMemoryChatState);
          },
        );
~~~~~
~~~~~javascript.new
        // 3. 检查并触发交互式迁移 (如 v5 -> v6)
        await MigrationManager.checkAndTriggerInteractiveMigrations(
          storageManager,
          server,
          inMemoryChatState,
          (newState) => {
            inMemoryChatState = newState;
            uiControls.setState(inMemoryChatState);
          },
        );
~~~~~

#### Acts 3: 更新 `tests/migrations.test.js`

~~~~~act
patch_file
tests/migrations.test.js
~~~~~
~~~~~javascript.old
  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', async () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    const currentV6 = {};
    const result = await MigrationManager.migrateV5toV6(v5Data, 'Main Server', currentV6);

    expect(result['Main Server'].Local[0].content).toBe('msg');
~~~~~
~~~~~javascript.new
  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', async () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    const currentV6 = {};
    const result = await MigrationManager.migrateV5toV6(storageManager, v5Data, 'Main Server', currentV6);

    expect(result['Main Server'].Local[0].content).toBe('msg');
~~~~~

### 下一步建议
通过将 `storage` 实例作为参数传递，我们优雅地解决了循环依赖和引用错误。

现在所有的单元测试应该都能通过了。V7 的重构已经完成，你可以进行最后的打包测试，验证 `IndexedDB` 是否按预期工作。

如果一切正常，我们可以准备 `git commit` 了。
