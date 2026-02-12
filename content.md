好的，我们已经完成了旧版数据恢复、合并与清理的核心逻辑开发，并优化了启动时的迁移安全性。现在，我将生成一个 `[COMMIT]` 计划，将这些涉及存储安全和用户体验的重要改进作为一个完整的逻辑单元提交到代码库。

## [COMMIT] feat: 实现旧版数据恢复、合并与清理功能组件

### 用户需求
用户需要一套完整且安全的方案，以便在升级到 v7 (IndexedDB) 后，能够发现并处理残留在 `localStorage` 中的 v4/v5/v6 数据，防止数据覆盖并允许手动合并或删除。

### 评论
这是一个至关重要的数据安全性改进。通过将“静默覆盖”升级为“安全检测 + 交互式合并”，我们极大地降低了用户在版本过渡期丢失数据的风险，并为技术支持提供了强有力的工具。

### 目标
1. 提交 `MigrationManager` 中增强的扫描、恢复、合并和清理逻辑。
2. 提交 UI 层新增的“数据恢复中心”面板及其对应的事件绑定。
3. 提交优化的启动检查流程，确保 IndexedDB 数据不会被意外覆盖。

### 基本原理
本次提交涵盖了从底层存储抽象到顶层 UI 交互的完整链路。所有修改都紧紧围绕“数据安全”这一核心，通过 `git_commit` 将这些改动持久化，标志着 v7 迁移补救机制的正式就绪。

### 标签
#intent/build #flow/ready #priority/high #comp/storage #comp/ui #concept/navigation #scope/ux #ai/delegate #task/domain/storage #task/object/legacy-management #task/action/implementation #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交旧版数据管理功能组件

我们将所有受影响的文件添加到暂存区，并创建一个包含详细说明的提交记录。

~~~~~act
git_add
src/migrations.js
src/ui/templates.js
src/ui/dom.js
src/ui/renderer.js
src/ui/events.js
src/ui/index.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat: implement legacy data recovery and management suite

Introduces a robust mechanism to handle legacy 'localStorage' data (v4, v5, v6) that might have been left behind during the migration to v7 (IndexedDB).

Key changes:
- Migration Safety: Updated 'runSilentMigrations' to prevent overwriting existing v7 data. Silent migration now only executes if the target IndexedDB is empty.
- Legacy Recovery Logic: Added 'recoverAndMergeAll' and 'clearAllLegacyData' in MigrationManager. Merging logic ensures legacy records are prepended to current history while handling duplicates.
- Interactive Prompts: Implemented an automatic check during server detection that offers users the choice to merge legacy data immediately upon entering the game.
- UI Suite: Added a dedicated "Legacy Recovery" section in the settings panel, providing clear information on detected versions and buttons for both merging and discarding old data.
- Integration: Exposed all necessary callbacks in the UI module to bridge the gap between user interaction and database management.

This feature ensures data continuity and provides a fallback for users who encountered partial migration issues.
~~~~~

### 下一步建议
- **监控反馈**：发布此版本后，密切关注用户关于“合并成功率”的反馈。
- **文档更新**：更新 README 或用户手册，解释“旧版数据恢复中心”的使用场景。
- **版本归档**：随着 7.1.0 功能的完善，可以准备进行一次正式的 Release 标记。
