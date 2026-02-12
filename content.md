这个警告揭示了一个架构上的**循环依赖 (Circular Dependency)**。在 Vite/Rollup 构建时，它发现 `migrations.js` 既被静态引用又被动态引用，这通常意味着模块之间的边界模糊。

循环链条是：`storage/index.js` -> `migrations.js` -> `state.js` -> `utils.js` -> `storage/index.js`（为了计算存储大小）。

我们将通过**将存储统计逻辑从通用工具类中移出**来彻底切断这个环路，从而消除动态导出的必要性，并解决构建警告。

## [WIP] refactor: 消除循环依赖并解决构建警告

### 错误分析
构建警告的根本原因是：
1.  `src/utils.js` 引用了 `src/storage/index.js` 来实现 `getStorageUsageInMB`。
2.  这使得 `utils.js` 不再是一个“叶子模块”，而是依赖于高层逻辑。
3.  `storage/index.js` 为了避免在初始化时产生死锁，不得不动态导入 `migrations.js`。
4.  但 `main.js` 为了交互式迁移又静态导入了 `migrations.js`。
5.  Vite 检测到这种混合导入模式，发出了性能与结构警告。

### 用户需求
消除构建警告，优化模块依赖结构。

### 评论
在前端架构中，`utils` 应该是纯粹的、无副作用的工具函数集合。一旦 `utils` 开始引用 `manager` 或 `state`，就会引发依赖地狱。将 `getStorageUsageInMB` 移至 `storage` 模块是更符合职责单一原则的做法。

### 目标
1.  切断 `utils.js` 对 `storage/index.js` 的依赖。
2.  将 `getStorageUsageInMB` 迁移至 `storage/index.js`。
3.  将 `storage/index.js` 对 `migrations.js` 的引用改为标准的静态导入。

### 基本原理
-   **层级化依赖**：建立明确的模块层级：`Constants/Utils` (底层) -> `Data/State` -> `Migrations` -> `Storage` -> `UI/Main` (顶层)。
-   **静态化**：消除不必要的 `await import`，使代码更易于静态分析和打包优化。

### 标签
#intent/refine #flow/ready #priority/medium #comp/build #comp/runtime #scope/dx #ai/delegate #task/domain/build #task/object/dependency-graph #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 重构 `src/utils.js`

移除导致循环依赖的存储相关函数。

~~~~~act
patch_file
src/utils.js
~~~~~
~~~~~javascript.old
import { storageManager } from './storage/index.js';

/**
 * 计算脚本在 localStorage 中的存储占用空间。
 * @returns {Promise<number>} - 占用的空间大小，单位是 MB。
 */
export async function getStorageUsageInMB() {
  const sizeInBytes = await storageManager.getRawSize();
  return sizeInBytes / (1024 * 1024);
}

/**
 * 简单的异步等待函数
~~~~~
~~~~~javascript.new
/**
 * 简单的异步等待函数
~~~~~

#### Acts 2: 修复 `src/storage/index.js`

接管存储统计逻辑，并将 `MigrationManager` 改为静态导入。

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
import { IndexedDBAdapter } from './indexed-db-adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
// 避免循环依赖，我们将在 init 方法内部动态导入 MigrationManager，或者将其作为依赖注入
// 但由于 MigrationManager 是单例对象，直接导入通常也可行，只要小心循环引用
// 这里我们假设 main.js 会协调这一过程，或者在这里动态导入

/**
 * Manages the storage backend for the application.
~~~~~
~~~~~javascript.new
import { IndexedDBAdapter } from './indexed-db-adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
import { MigrationManager } from '../migrations.js';

/**
 * Manages the storage backend for the application.
~~~~~

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
      // --- 迁移逻辑集成 ---
      // 在正式切换到 IndexedDB 之前，检查是否需要迁移
      // 我们创建一个临时的 LocalStorageAdapter 来读取旧数据
      const sourceAdapter = new LocalStorageAdapter();
      // LocalStorageAdapter 不需要 await init() 因为它是同步模拟的，但为了接口一致性...
      await sourceAdapter.init();

      // 动态导入以避免潜在的循环依赖问题 (storage/index.js <-> migrations.js)
      const { MigrationManager } = await import('../migrations.js');
      await MigrationManager.runSilentMigrations(sourceAdapter, targetAdapter);

      this.adapter = targetAdapter;
~~~~~
~~~~~javascript.new
      // --- 迁移逻辑集成 ---
      // 在正式切换到 IndexedDB 之前，检查是否需要迁移
      // 我们创建一个临时的 LocalStorageAdapter 来读取旧数据
      const sourceAdapter = new LocalStorageAdapter();
      // LocalStorageAdapter 不需要 await init() 因为它是同步模拟的，但为了接口一致性...
      await sourceAdapter.init();

      await MigrationManager.runSilentMigrations(sourceAdapter, targetAdapter);

      this.adapter = targetAdapter;
~~~~~

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  removeV5Data() {
    return this.adapter.removeV5Data();
  }
}

// Export a singleton instance
export const storageManager = new StorageManager();
~~~~~
~~~~~javascript.new
  removeV5Data() {
    return this.adapter.removeV5Data();
  }
}

// Export a singleton instance
export const storageManager = new StorageManager();

/**
 * 计算存储占用空间（辅助函数）。
 * @returns {Promise<number>} - 占用的空间大小，单位是 MB。
 */
export async function getStorageUsageInMB() {
  const sizeInBytes = await storageManager.getRawSize();
  return sizeInBytes / (1024 * 1024);
}
~~~~~

#### Acts 3: 更新 UI 引用

将 UI 渲染器对 `getStorageUsageInMB` 的引用来源从 `utils` 改为 `storage`。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
import { generateStatisticsText } from '../analysis.js';
import { storageManager } from '../storage/index.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from '../utils.js';
~~~~~
~~~~~javascript.new
import { generateStatisticsText } from '../analysis.js';
import { storageManager, getStorageUsageInMB } from '../storage/index.js';
import { formatISOTimeForDisplay } from '../utils.js';
~~~~~

### 下一步建议
- **运行构建**: 再次执行 `npm run build` 或 `vite build`，确认该警告已经消失。
- **验证功能**: 特别是 V6 -> V7 的静默迁移逻辑（在 `storageManager.init` 中），由于现在改成了静态导入，需要确保其在首次启动时依然能正确执行。
