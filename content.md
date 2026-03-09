好的，我们已经完成了合并算法的重构以及相关测试的补全。现在，我将生成一个 `[COMMIT]` 计划，将这些旨在彻底修复数据冗余和随机插入问题的变更正式提交到仓库。

## [COMMIT] fix(state): refactor merge logic to zipper-merge with local interpolation

### 用户需求
正式提交对聊天记录合并算法的重构，以及配套的单元测试。

### 评论
这是对 pt-chat-archiver 核心稳定性的关键改进。通过引入“拉链式”缝合（Zipper Merge）并移除危险的全局 ID 重写，我们从算法层面根治了数据在重新加载时产生重复的潜在路径。

### 目标
1.  将 `src/state.js`、`tests/state.test.js` 和 `tests/ordering.test.js` 添加到 Git 暂存区。
2.  创建一个包含详细变更说明的提交。

### 基本原理
按照 Quipu 协议，我们将文件变更与 Git 提交操作分离。此计划仅负责将已验证的修改进行持久化记录。

### 标签
#intent/fix #flow/ready #priority/high #comp/runtime #comp/tests #concept/state #ai/instruct #task/domain/storage #task/object/zipper-merge #task/action/implementation #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交重构变更

我们将相关的状态逻辑和测试文件添加到暂存区并提交。

~~~~~act
git_add
src/state.js
tests/state.test.js
tests/ordering.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
fix(state): refactor merge logic to zipper-merge with local interpolation

Refactors the 'mergeAndDeduplicateMessages' function to use a "zipper-style" merge algorithm. This approach precisely identifies missing messages in the middle of a sequence and inserts them without altering existing record IDs.

- Removed 'ensureIdMonotonicity' which caused cascading ID rewrites and IndexedDB record duplication.
- Implemented local time interpolation: new messages get a timestamp of their predecessor + 1ms to ensure uniqueness and order without corrupting existing records.
- Increased lookahead window to 50 for more robust alignment detection during historical rescans.
- Updated and added unit tests to verify ID immutability and accurate insertion in gap scenarios.
~~~~~

### 下一步建议
- **回归测试**: 建议在实际游戏中进行几次“开关聊天框”的操作，验证控制台不再出现重复插入的警告或数据。
- **性能监控**: 随着 lookahead 窗口的扩大，在单频道消息极多（如超过 5000 条）的情况下，关注合并操作是否有明显的 UI 卡顿。如果出现，可以考虑将合并逻辑移至 Web Worker 中执行。
