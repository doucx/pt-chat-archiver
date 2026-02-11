好的，我们已经完成了从 V6 到 V7 架构的演进，包括异步 IO 改造、IndexedDB 适配器的实现、ULID 的引入以及无感迁移逻辑。现在我们将这些变更作为一个完整的逻辑单元提交。

## [COMMIT] feat: 实现 V7 架构：IndexedDB 存储与异步存储层

### 评论
这次提交标志着 PT Chat Archiver 进入了一个新的性能阶段。通过从 LocalStorage 迁移到 IndexedDB，我们克服了 5MB 的存储限制，并为未来的按需加载和全文搜索奠定了基础。异步化重构虽然带来了代码复杂度的提升，但也显著增强了应用的健壮性。

### 目标
1.  将所有新增和修改的文件提交到版本库。
2.  提供详尽的提交说明，记录架构演进的关键决策。

### 标签
#intent/build #flow/ready #priority/high #comp/engine #comp/runtime #concept/storage #scope/core #ai/instruct #task/domain/storage #task/object/v7-architecture #task/action/commit #task/state/end

---

### Script

#### Acts 1: 提交变更

我们将所有相关文件添加到 Git 暂存区并创建提交。

~~~~~act
git_add
src/utils.js
src/parser.js
src/constants.js
src/data/transformer.js
src/storage/indexed-db-adapter.js
src/storage/index.js
src/migrations.js
src/main.js
tests/storage.test.js
tests/migrations.test.js
tests/ui_state.test.js
tests/ui.integration.test.js
tests/storage/indexed-db.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat(storage): implement V7 architecture with IndexedDB and async storage layer

This major architectural update transitions the storage engine from synchronous LocalStorage to asynchronous IndexedDB, overcoming storage limits and improving performance.

Key changes:
- Introduced 'IndexedDBAdapter' for high-capacity, non-blocking storage.
- Refactored 'StorageManager' to support asynchronous initialization and dynamic adapter selection.
- Implemented 'ULID' generation in 'utils.js' and 'parser.js' for unique message identification and efficient indexing.
- Created 'transformer.js' to provide seamless conversion between V6 nested objects and V7 flat database records.
- Added a robust migration path in 'migrations.js' that automatically moves V6 data to V7 upon first launch.
- Refactored all tests and UI state management to adopt the new 'Async-First' IO model.

This update resolves the long-standing 5MB limit and provides the foundation for future features like on-demand loading and full-text search.
~~~~~

### 下一步建议
- **回归测试**: 在不同浏览器环境下验证迁移逻辑的稳定性。
- **性能调优**: 现在的 `saveAllV6` 仍然是全量写入，随着数据量增长，可以考虑实现基于 ULID 的增量写入以优化性能。
- **UI 增强**: 利用 IndexedDB 的优势，可以开始考虑实现历史记录的全文搜索功能。
