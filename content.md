好的，模块化重构已经完成且修复了回归 Bug。现在我将这些变更作为一个完整的逻辑单元提交到 Git 仓库。

## [COMMIT] refactor(ui): 模块化拆分 ViewCache 与 IOManager

### 用户需求
将最近对 UI 模块进行的模块化重构（拆分 `ViewCache` 和 `IOManager`）以及相关的 Bug 修复进行 Git 提交。

### 评论
这是一次重要的架构改进。通过消除 `src/ui/index.js` 中的“上帝对象”倾向，我们显著提升了代码的可读性和可维护性，也为后续对缓存算法进行针对性优化打下了基础。

### 目标
1.  将新创建的 `src/ui/view-cache.js` 和 `src/ui/io-manager.js` 添加到暂存区。
2.  将修改后的 `src/ui/index.js` 添加到暂存区。
3.  创建一个描述详尽的提交记录。

### 基本原理
遵循“一个小步，一个提交”的原则。我们将这次关于“UI 职责分离”的改动封装在一起。在提交前，我们已经通过测试确认了逻辑的正确性（包括对 `currentRenderId` 回归问题的修复）。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #scope/core #ai/instruct #task/domain/ui #task/object/module-separation #task/action/refactor #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交 UI 模块化重构变更

我们将相关的三个文件添加到 Git 并提交。

~~~~~act
git_add
src/ui/view-cache.js
src/ui/io-manager.js
src/ui/index.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
refactor(ui): modularize ViewCache and IOManager

Splits the monolithic `src/ui/index.js` by extracting:
- `ViewCache`: A standalone class for memory-based LRU paging cache.
- `IOManager`: A specialized module for JSON/TXT export, downloads, and data imports.

This refactoring reduces the complexity of the UI entry point, improves
separation of concerns, and enables independent unit testing of the
caching and I/O logic.

Also includes a fix for a ReferenceError caused by the accidental
deletion of `currentRenderId` during the initial refactor.
~~~~~

### 下一步建议
- **重构 `main.js`**: 现在的 UI 已经变得干净了，但 `main.js` 仍然非常臃肿。下一步可以按照计划，提取 `ChatMonitor` 类来封装底层的 `MutationObserver` 和 DOM 轮询逻辑。
- **完善测试**: 为新提取出的 `ViewCache` 编写专门的单元测试，确保其 LRU 策略和边界情况处理（如页面大小变动时的处理）是健壮的。
