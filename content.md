根据你 `rg` 的搜索结果，确实还有几处“漏网之鱼”。`StorageManager` 中虽然返回了空 Promise，但这些方法名本身已经没有存在意义了。同时，`LocalStorageAdapter.clearAllData` 还在尝试引用已经删除导出的 `STORAGE_KEY_V5`。

我将进行最后的彻底清理。

## [WIP] refactor: 彻底移除 V4/V5 的所有存根方法与残留引用

### 用户需求
根据全局搜索结果，彻底删除 `src/storage` 中关于 V4 和 V5 的最后几处方法存根和变量引用。

### 评论
清理工作必须彻底。保留这些空方法（Stubs）只会让未来的开发者感到困惑。现在我们将它们完全抹除，使 API 恢复到最精简的状态。

### 目标
1.  从 `src/storage/index.js` 中删除 `removeV4Data` 和 `removeV5Data` 方法。
2.  从 `src/storage/local-storage.adapter.js` 的 `clearAllData` 中移除对 `STORAGE_KEY_V5` 的清理操作。

### 标签
#intent/refine #flow/ready #priority/medium #comp/storage #scope/core #ai/refine #task/domain/refactoring #task/object/legacy-cleanup-final #task/action/cleanup #task/state/end #task/status/completed

---

### Script

#### Acts 1: 清理 StorageManager 存根方法

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  removeV4Data() {
    return Promise.resolve();
  }

  removeV5Data() {
    return Promise.resolve();
  }
}
~~~~~
~~~~~javascript.new
}
~~~~~

#### Acts 2: 修复 LocalStorageAdapter 的清理逻辑

移除对已不存在变量 `STORAGE_KEY_V5` 的引用。

~~~~~act
patch_file
src/storage/local-storage.adapter.js
~~~~~
~~~~~javascript.old
  clearAllData() {
    localStorage.removeItem(STORAGE_KEY_V6);
    localStorage.removeItem(STORAGE_KEY_V5);
    return Promise.resolve();
  }
~~~~~
~~~~~javascript.new
  clearAllData() {
    localStorage.removeItem(STORAGE_KEY_V6);
    return Promise.resolve();
  }
~~~~~

### 下一步建议
- **重新执行构建**: 再次运行 `npm run build`。由于现在没有任何地方引用 `STORAGE_KEY_V5` 等已删除常量，构建应该可以顺利通过。
- **验证功能**: 启动项目并点击 UI 中的“清空所有本地存档”，验证功能是否正常且没有控制台报错。
