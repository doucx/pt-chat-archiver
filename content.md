由于我们在 `src/constants.js` 中删除了旧版 Key 的导出，但未同步清理 `src/storage/local-storage.adapter.js` 顶部的导入声明，导致 Rollup 在构建时无法找到符号。此外，`StorageManager` 中还残留了一个指向已删除适配器方法的 `loadAllV4` 代理。

我将立即修复这些残留的引用。

## [WIP] fix: 修复因删除迁移常量导致的构建错误

### 错误分析
- **编译错误**: `src/storage/local-storage.adapter.js` 尝试从 `constants.js` 导入已经不存在的 `STORAGE_KEY_V5` 和 `OLD_STORAGE_KEY_V4`。
- **潜在运行时错误**: `src/storage/index.js` 中的 `StorageManager` 仍然保留了 `loadAllV4` 方法，但底层的适配器实现已被删除。

### 用户需求
修复构建失败问题，并清理所有文件对已删除迁移逻辑的残留引用。

### 评论
这是在快速重构过程中常见的“悬挂引用”问题。清理这些导入和死代码不仅能恢复构建，还能保持代码库的纯净。

### 目标
1.  清理 `src/storage/local-storage.adapter.js` 的导入列表。
2.  删除 `src/storage/index.js` 中无用的 `loadAllV4` 存根方法。

### 标签
#intent/fix #flow/ready #priority/critical #comp/storage #scope/build #ai/refine #task/domain/build-fix #task/object/import-cleanup #task/action/fix #task/state/continue

---

### Script

#### Acts 1: 修复 LocalStorageAdapter 导入

移除不再存在的常量导入。

~~~~~act
patch_file
src/storage/local-storage.adapter.js
~~~~~
~~~~~javascript.old
import {
  CONFIG_KEY,
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_KEY_V6,
} from '../constants.js';
~~~~~
~~~~~javascript.new
import {
  CONFIG_KEY,
  SELF_NAME_KEY,
  STORAGE_KEY_V6,
} from '../constants.js';
~~~~~

#### Acts 2: 清理 StorageManager 中的残留方法

删除已经没有适配器支持的 `loadAllV4`。

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  getTotalMessageCount() {
    if (this.adapter?.getTotalMessageCount) {
      return this.adapter.getTotalMessageCount();
    }
    return Promise.resolve(0);
  }

  loadAllV4() {
    return this.adapter.loadAllV4();
  }

  removeV4Data() {
~~~~~
~~~~~javascript.new
  getTotalMessageCount() {
    if (this.adapter?.getTotalMessageCount) {
      return this.adapter.getTotalMessageCount();
    }
    return Promise.resolve(0);
  }

  removeV4Data() {
~~~~~

#### Acts 3: 进一步清理 StorageManager

在 `StorageManager` 的末尾也存在旧版方法的存根，需要一并清除。

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  removeV4Data() {
    return this.adapter.removeV4Data();
  }

  loadAllV5() {
    return this.adapter.loadAllV5();
  }

  removeV5Data() {
    return this.adapter.removeV5Data();
  }
}
~~~~~
~~~~~javascript.new
  removeV4Data() {
    return Promise.resolve();
  }

  removeV5Data() {
    return Promise.resolve();
  }
}
~~~~~

### 下一步建议
- **重新执行构建**: 请再次尝试运行 `npm run build` 验证是否通过。
- **全局搜索**: 建议在编辑器中全局搜索 `V4`, `V5` 字样，确保没有遗漏的变量或注释。
