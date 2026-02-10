好的，我们已经完成了迁移系统的解构与重构，并修复了代码风格问题。现在我们将这些更改作为一个完整的逻辑单元提交到版本库。

## [COMMIT] refactor: 建立独立的迁移管理系统并简化主程序逻辑

### 用户需求
将版本更新逻辑从主业务流程中剥离，建立专门的迁移处理器以支持从 v4 到 v6 的平滑升级，并为未来版本留出扩展空间。

### 评论
这次重构成功地将 `main.js` 的职责从“环境维护”中解放出来，使其更专注于“功能调度”。`MigrationManager` 现在负责所有的版本检测、静默升级和交互式提示，逻辑更加清晰。

### 目标
1.  提交新创建的 `src/migrations.js`。
2.  提交对 `src/state.js` 和 `src/main.js` 的简化修改。

### 基本原理
遵循关注点分离原则，将数据演进逻辑（Migrations）与状态管理（State）和生命周期管理（Main）分离。

### 标签
#intent/refine #flow/ready #priority/high #comp/engine #concept/state #scope/core #ai/delegate #task/domain/storage #task/object/migration-system #task/action/refactor #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交重构代码

我们将所有涉及到的文件添加到暂存区并创建提交。

~~~~~act
git_add
src/migrations.js
src/state.js
src/main.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
refactor: extract migration logic into a dedicated MigrationManager

- Created `src/migrations.js` to centralize all version upgrade logic (v4 -> v6).
- Simplified `src/main.js` by delegating migration checks to `MigrationManager`.
- Removed redundant migration code from `src/state.js`.
- Fixed linting issues related to template literals in the new migration module.
- Improved the migration flow to support chain upgrades (silent then interactive).
~~~~~

### 下一步建议
- **验证升级路径**：在实际环境中测试从旧版本直接升级到新版本的完整流程。
- **规划 v7 架构**：考虑是否需要引入版本号（Version Tag）记录在持久化层，以便 `MigrationManager` 更高效地判断升级步长。
