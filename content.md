好的，我们已经完成了“导入并合并”功能的开发。现在将其作为一个完整的逻辑单元提交。

## [COMMIT] feat: 添加“导入并合并”功能以支持无损合并聊天记录

### 用户需求
将之前实现的“导入并合并”功能及其相关的存储层、控制层和 UI 层代码修改提交到版本库。

### 评论
该提交标志着系统数据导入能力的完善。从简单的“全量覆盖”进化到“增量合并”，极大提升了用户在多设备或备份恢复场景下的体验，且充分利用了 V7 架构中 ULID 的幂等特性。

### 目标
1.  将所有相关文件的修改加入 Git 暂存区。
2.  创建一个清晰、符合规范的提交记录。

### 基本原理
按照项目规范，所有的功能实现代码在经过验证后应通过 `[COMMIT]` 计划进行持久化记录。由于此前我们对存储、逻辑和 UI 进行了全链条的修改，本次提交将包含这些分散但逻辑关联的变更。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #comp/engine #concept/storage #scope/ux #ai/instruct #task/domain/storage #task/object/import-merge #task/action/integration #task/state/end

---

### Script

#### Acts 1: 提交代码变更

我们将所有受影响的文件添加到暂存区并执行提交。

~~~~~act
git_add
src/storage/indexed-db-adapter.js
src/storage/index.js
src/ui/templates.js
src/ui/dom.js
src/ui/index.js
src/ui/events.js
src/main.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat: add "Import and Merge" functionality using ULID deduplication

Implemented a non-destructive import method that allows users to merge external JSON archives into their current database.

Key changes:
- Storage: Added `mergeAllV6` to IndexedDBAdapter, leveraging ULID keys and IDBObjectStore.put() for idempotent deduplication.
- UI: Added a dedicated "Import and Merge JSON" button in the settings view with visual feedback during the process.
- Controller: Implemented the file reading and merge orchestration logic in the UI module.

This feature provides a safer way to consolidate chat histories across different devices or sessions without the risk of overwriting existing data.
~~~~~

### 下一步建议
- **回归测试**: 建议在不同浏览器环境下测试该合并功能，特别是确保当合并包含数千条记录的大文件时，UI 依然保持响应。
- **文档更新**: 如果有用户手册或 README，应当更新“数据维护”章节，说明“覆盖导入”与“合并导入”的区别，并推荐使用后者。
