我们已经完成了从底层存储引擎到 UI 交互逻辑的全面升级。现在，所有的功能都已经过验证，包括修正后的清理逻辑和新的测试用例。

我将生成一个 `[COMMIT]` 计划，将这些更改作为一个逻辑单元提交到代码库。

## [COMMIT] feat: 升级存储统计功能并支持旧版备份清理

### 用户需求
将存储容量展示从误导性的“5MB 限制”切换为基于 IndexedDB 的真实估算，并提供清理旧版 LocalStorage 备份的功能。

### 评论
这次提交标志着存储架构从 LocalStorage 完全转向 IndexedDB 后的“收尾工作”完成。它不仅改善了用户在设置页面的信息获取体验（显示消息总数），还通过修正清理逻辑和增加回归测试，确保了在多服务器嵌套结构下的数据健壮性。

### 目标
1.  提交所有涉及存储引擎增强、UI 统计更新和逻辑修复的代码。
2.  包含新添加的 `tests/ui.clean_duplicates.test.js` 回归测试文件。

### 基本原理
按照 Quipu 协议，我们将所有造成文件系统变更的操作（之前的 `write_file` / `patch_file`）在验证后，通过此 `[COMMIT]` 计划正式记录到历史中。

### 标签
#intent/build #flow/ready #priority/medium #comp/storage #comp/ui #comp/tests #concept/state #scope/ux #scope/dx #ai/instruct #task/domain/storage #task/object/idb-optimization #task/action/implementation #task/state/end

---

### Script

#### Acts 1: 提交代码变更

我们将所有修改过的源文件和新测试文件添加到暂存区并创建提交。

~~~~~act
git_add
src/constants.js
src/storage/indexed-db-adapter.js
src/storage/local-storage.adapter.js
src/storage/index.js
src/ui/templates.js
src/ui/dom.js
src/ui/renderer.js
src/ui/events.js
src/ui/index.js
tests/ui.clean_duplicates.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat: upgrade storage stats and support legacy backup cleanup

- Modernized UI: Removed misleading 5MB limit warnings and added real-time display of total message count and estimated DB size.
- IDB Enhancements: Implemented `getTotalMessageCount` and `getRawSize` for IndexedDBAdapter using serialization-based estimation.
- Maintenance: Added "Delete Legacy Backup" feature to free up browser LocalStorage after V6->V7 migration.
- Bug Fix: Refactored `cleanChannelRecords` logic to correctly navigate the nested Server-Channel (V6) structure.
- Quality: Added integration regression tests for cleaning logic in nested environments.
~~~~~

### 下一步建议
- **性能评估**：在拥有超大规模存档（如 50 万条消息以上）的环境中观察“设置”页面的打开速度。如果出现明显的阻塞，建议将大小计算逻辑改为按需触发或后台增量更新。
- **发布准备**：考虑到这是一个涉及到存储展示和备份删除的重要更新，建议在正式发布说明中告知用户：5MB 的限制已解除，现在的容量上限主要取决于磁盘剩余空间。
