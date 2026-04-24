好的，我们已经完成了所有的代码重构、清理和修复工作。现在，项目已经彻底摆脱了旧版本的兼容性包袱，API 语义也更加清晰。

我将生成一个 `[COMMIT]` 计划，将这些变更作为一个完整的逻辑单元提交。

## [COMMIT] refactor: 彻底移除旧版数据迁移逻辑并优化存储 API

### 用户需求
完成对项目中旧版本（V4/V5/V6）数据迁移逻辑的清理，重命名相关的存储 API 以消除版本暗示，并修复由此产生的构建和测试问题。

### 评论
这次重构极大地精简了存储层的逻辑。移除了一次性的迁移代码后，`StorageManager` 和适配器的代码行数显著减少，系统的可维护性得到了提升。API 的重命名也让数据导入导出功能的意图更加明确。

### 目标
1.  将所有变更文件添加到 Git 暂存区。
2.  创建一个详尽的提交记录，说明重构的内容和修复的构建错误。

### 基本原理
按照 Quipu 协议，在完成一系列不稳定的文件系统变更并确认逻辑闭环后，我们需要通过一个独立的 `[COMMIT]` 计划来持久化这些成果。这将形成一个干净的 Git 历史节点，方便后续的回溯和协作。

### 标签
#intent/refine #flow/ready #priority/high #comp/storage #comp/tests #comp/ui #scope/core #scope/build #ai/refine #task/domain/refactoring #task/object/legacy-migration-removal #task/action/cleanup #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交代码重构与清理

我们将把涉及到的所有源文件、测试文件以及已删除的文件变更提交到仓库。

~~~~~act
git_add
src/constants.js
src/main.js
src/migrations.js
src/storage/index.js
src/storage/indexed-db-adapter.js
src/storage/local-storage.adapter.js
src/ui/components/ConfigPanel.jsx
src/ui/index.jsx
tests/migrations.test.js
tests/migrations_pipeline.test.js
tests/storage.test.js
tests/ui.clean_duplicates.test.js
tests/ui.integration.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
refactor: remove legacy data migration logic and modernize storage API

This commit performs a major cleanup of the storage subsystem by removing all migration paths for deprecated data versions (V4, V5, and V6).

Key changes:
- Deleted 'src/migrations.js' and all associated tests.
- Renamed 'V6' specific methods in storage adapters to generic 'Archive' names (e.g., 'exportFullArchive', 'overwriteFullArchive', 'mergeFullArchive') to better reflect their current role as data import/export interfaces.
- Cleaned up 'StorageManager' and 'LocalStorageAdapter' by removing unused stub methods and dangling references to deleted constants.
- Updated UI components and integration tests to align with the new API naming.
- Fixed a build-time error caused by obsolete imports in the local storage adapter.

This refactoring simplifies the codebase, reduces technical debt, and improves the clarity of the storage API for future development.
~~~~~

### 下一步建议
- **监控生产环境**: 在下一个版本发布后，注意观察是否有极少数仍持有超旧版（V4/V5）数据且从未升级的用户反馈数据丢失（虽然概率极低，因为 V7 已发布一段时间）。
- **文档更新**: 如果有相关的 API 文档或开发指南，请同步更新其中涉及到的存储方法名。
- **性能评估**: 既然迁移逻辑已移除，可以评估是否能进一步优化 `StorageManager` 的启动耗时（尽管目前已经是异步的）。
