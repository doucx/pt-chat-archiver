我们已经成功完成了存储层和 UI 层的异步化改造，并修复了渲染器中的回归问题，所有测试均已通过。现在是时候将这一阶段的成果作为一个完整的逻辑单元进行提交了。

## [COMMIT] refactor: transition to async-first storage and UI architecture

### 用户需求
将 V7 架构演进的第一阶段——全站异步化改造——提交到 Git 仓库。

### 评论
这次重构是 V7 架构的基石。虽然它没有改变现有的 LocalStorage 存储行为，但它改变了应用处理数据流的根本方式（同步转异步）。这消除了未来引入 IndexedDB 时的最大障碍。

### 目标
1.  将所有相关文件添加到 Git 暂存区。
2.  创建一个包含详细描述的提交，记录这次重构的范围和目的。

### 基本原理
遵循“逻辑单元提交”原则。此次提交涵盖了从存储适配器、状态管理到 UI 事件绑定的全链路异步化修改。

### 标签
#intent/tooling #flow/ready #priority/medium #comp/build #ai/instruct #task/domain/storage #task/object/async-architecture #task/action/commit #task/state/end

---

### Script

#### Acts 1: 提交变更

我们将把所有修改过的源文件和测试文件添加到 Git，并执行提交。

~~~~~act
git_add
src/storage/local-storage.adapter.js
src/storage/index.js
src/state.js
src/migrations.js
src/main.js
src/utils.js
src/ui/state.js
src/ui/renderer.js
src/ui/events.js
src/ui/index.js
tests/storage.test.js
tests/ui_state.test.js
tests/ui.integration.test.js
tests/migrations.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
refactor: transition to async-first storage and UI architecture

This commit implements Phase 1 of the V7 architecture evolution. The core objective was to decouple the application logic from synchronous storage IO, preparing the codebase for IndexedDB.

Key changes:
- Introduced `IStorageAdapter` interface and `LocalStorageAdapter` (async-over-sync wrapper).
- Created `StorageManager` as a central, backend-agnostic entry point for data persistence.
- Refactored `main.js`, `state.js`, and `migrations.js` to handle asynchronous data loading and saving.
- Updated the UI module (`ui/*.js`) to await storage operations, including an async factory for `UIState`.
- Added a `sleep` utility and updated `getStorageUsageInMB` to be async.
- Fixed a rendering bug where `usageMB` was being treated as a number instead of a Promise.
- Fully migrated the test suite to `async/await`.

Note: The legacy `src/storage.js` has been replaced by the structured `src/storage/` directory.
~~~~~

### 下一步建议

既然基础设施已经异步化，我们现在可以安全地进入 **第二阶段：抽象层构建与 ULID 引入**。

我建议下一步的操作是：
1.  **引入 ULID**: 在 `parser.js` 中引入消息唯一 ID 生成机制。
2.  **重构数据结构**: 开始定义扁平化的 V7 Schema (Messages Store)，并实现 V6 (嵌套) 与 V7 (扁平) 之间的转换器 (`Transformer`)。
3.  **并发锁**: 在 `StorageManager` 中实现简单的保存锁，防止异步自动保存导致的数据竞争。

如果你准备好了，请告诉我，我们将开始 Step 2。
