[简要回答]

## [WIP] refactor(migrations): 支持源(LS)与目标(IDB)分离的 V5 迁移

### 用户需求
1.  重构 `migrateV5toV6`，使其接受独立的源 (Source) 和目标 (Target) 适配器。
2.  确保 V5 的遗留数据可以直接从 Source 读取并写入 Target，而不必在中间经过 LocalStorage 的写入操作。

### 评论
错误日志 `TypeError: Cannot create property '[object Object]' on string 'TargetServer'` 非常有趣。这表明测试代码在调用 `migrateV5toV6` 时传入的参数顺序与函数定义的参数顺序不匹配，导致函数试图把一个对象当成属性名来赋值。这验证了我们的假设：当前的 `migrateV5toV6` 确实只支持单一 storage 实例，需要拆分为 source/target。

### 目标
1.  修改 `src/migrations.js` 中的 `migrateV5toV6` 函数签名。
2.  更新该函数内部逻辑，分别调用 `source.removeV5Data()` 和 `target.saveAllV6()`。
3.  同步更新调用方 `checkAndTriggerInteractiveMigrations`，显式实例化 `LocalStorageAdapter` 作为 Source。
4.  顺手修复 `tests/migrations.test.js` 中因函数签名变更而可能失效的旧测试用例。

### 基本原理
我们将 `migrateV5toV6(storage, v5Data, targetServer, currentV6Data)` 重构为 `migrateV5toV6(source, target, v5Data, targetServer, currentV6Data)`。
这不仅修复了 IDB 模式下检测不到 V5 的问题，也从根本上解决了存储满时无法迁移的问题。

### 标签
#intent/refine #flow/ready #priority/high #comp/runtime #concept/state #scope/core #ai/instruct #task/domain/storage #task/object/migration-pipeline #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 重构 `src/migrations.js`

~~~~~act
patch_file
src/migrations.js
~~~~~
~~~~~javascript.old
import { STORAGE_KEY_V6 } from './constants.js';
import { mergeAndDeduplicateMessages } from './state.js';

/**
 * 版本迁移管理器
~~~~~
~~~~~javascript.new
import { STORAGE_KEY_V6 } from './constants.js';
import { mergeAndDeduplicateMessages } from './state.js';
import { LocalStorageAdapter } from './storage/local-storage.adapter.js';

/**
 * 版本迁移管理器
~~~~~

~~~~~act
patch_file
src/migrations.js
~~~~~
~~~~~javascript.old
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
      const confirmMsg = `【数据升级】检测到您的旧版本聊天存档。

是否将其迁移到当前服务器 [${serverName}]？

注意：如果存档不属于此服务器，请点击“取消”，切换到正确的服务器后再执行此操作。`;

      if (confirm(confirmMsg)) {
        const newV6State = await this.migrateV5toV6(v5Data, serverName, currentV6State);
        onMigrated(newV6State);
      }
    }

    // 2. 将来可以在这里添加 V6 -> V7 的检查逻辑
  },
};
~~~~~
~~~~~javascript.new
  /**
   * v5 -> v6: 多服务器支持 (支持源/目标分离的管道迁移)
   * @param {object} source - 源存储适配器 (通常是 LocalStorageAdapter)
   * @param {object} target - 目标存储适配器 (通常是 IndexedDBAdapter 或 StorageManager)
   */
  async migrateV5toV6(source, target, v5Data, targetServer, currentV6Data) {
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

    // 直接写入 Target (IDB)，无需经过 Source (LS) 的 save
    await target.saveAllV6(currentV6Data);
    // 从 Source (LS) 移除旧数据
    await source.removeV5Data();
    console.info('[Migration] V5 -> V6 迁移完成，旧数据已移除。');
    return currentV6Data;
  },

  /**
   * 检查并触发交互式迁移
   * @param {object} targetStorage - 目标存储实例 (StorageManager)
   * @param {string} serverName - 当前检测到的服务器名
   * @param {object} currentV6State - 当前内存中的 V6 状态
   * @param {Function} onMigrated - 迁移成功后的回调函数
   */
  async checkAndTriggerInteractiveMigrations(
    targetStorage,
    serverName,
    currentV6State,
    onMigrated,
  ) {
    if (!serverName) return;

    // 1. 处理 V5 -> V6
    // 强制创建一个 LocalStorageAdapter 作为 Source，以确保即使 target 是 IDB 也能读到旧数据
    const sourceStorage = new LocalStorageAdapter();
    const v5Data = await sourceStorage.loadAllV5();

    if (v5Data && Object.keys(v5Data).length > 0) {
      const confirmMsg = `【数据升级】检测到您的旧版本聊天存档。

是否将其迁移到当前服务器 [${serverName}]？

注意：如果存档不属于此服务器，请点击“取消”，切换到正确的服务器后再执行此操作。`;

      if (confirm(confirmMsg)) {
        const newV6State = await this.migrateV5toV6(
          sourceStorage,
          targetStorage,
          v5Data,
          serverName,
          currentV6State,
        );
        onMigrated(newV6State);
      }
    }

    // 2. 将来可以在这里添加 V6 -> V7 的检查逻辑
  },
};
~~~~~

#### Acts 2: 更新旧测试用例以匹配新签名

由于我们修改了 `migrateV5toV6` 的参数列表，之前的测试用例 `tests/migrations.test.js` 必然会失败。我们需要同步更新它。

~~~~~act
patch_file
tests/migrations.test.js
~~~~~
~~~~~javascript.old
  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', async () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    const currentV6 = {};
    const result = await MigrationManager.migrateV5toV6(
      storageManager,
      v5Data,
      'Main Server',
      currentV6,
    );

    expect(result['Main Server'].Local[0].content).toBe('msg');

    const storedV6 = JSON.parse(localStorage.getItem(STORAGE_KEY_V6));
    expect(storedV6['Main Server'].Local[0].content).toBe('msg');
    expect(localStorage.getItem(STORAGE_KEY_V5)).toBeNull();
  });
~~~~~
~~~~~javascript.new
  it('V5 -> V6: 应当将数据归档到指定的服务器节点下', async () => {
    const v5Data = { Local: [{ content: 'msg' }] };
    const currentV6 = {};
    // 需要根据新的签名传递 source 和 target
    // 在这个测试中，source 和 target 都是 storageManager (模拟单体 LS 迁移场景)
    const result = await MigrationManager.migrateV5toV6(
      storageManager,
      storageManager,
      v5Data,
      'Main Server',
      currentV6,
    );

    expect(result['Main Server'].Local[0].content).toBe('msg');

    const storedV6 = JSON.parse(localStorage.getItem(STORAGE_KEY_V6));
    expect(storedV6['Main Server'].Local[0].content).toBe('msg');
    expect(localStorage.getItem(STORAGE_KEY_V5)).toBeNull();
  });
~~~~~

### 下一步建议

1.  **运行所有测试**: `npm test`。现在 `tests/migrations_pipeline.test.js` 和 `tests/migrations.test.js` 都应该通过。
2.  **人工验证**: 如果条件允许，可以在浏览器控制台手动模拟 `localStorage` 写入失败的场景，再次验证迁移流程的健壮性。
3.  **提交代码**: 这是一个包含逻辑重构和测试增强的完整修复。
