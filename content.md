好的，Phase 2（数据库现代化）的重构工作已经圆满完成。我们成功将架构从“全量内存状态+定时快照保存”转向了“流式增量写入+按需分页查询”。这不仅大幅降低了内存压力，也彻底消除了定时保存带来的卡顿，并为后续引入 Web Worker 奠定了坚实基础。

我将生成一个 `[COMMIT]` 计划来提交这些变更。

## [COMMIT] refactor: 实现 IndexedDB 增量存储与 UI 异步化

### 用户需求
将存储引擎升级为增量读写模式，移除内存全量状态，并清理过时的“立刻保存”UI。

### 评论
这是一次深度的架构解耦。我们不仅在底层实现了复合索引的分页查询，还在逻辑层完成了从“同步副作用”向“异步纯函数”的转变。通过移除 `inMemoryChatState`，脚本的内存占用将不再随聊天记录的增长而膨胀。

### 目标
1. 提交数据库 Schema 升级逻辑（v1 -> v2）及其复合索引。
2. 提交 `IndexedDBAdapter` 的分页查询与增量写入实现。
3. 提交 `main.js` 和 `ui/index.js` 的去状态化重构。
4. 提交对“立刻保存”按钮及相关陈旧逻辑的清理。
5. 提交适配异步架构的测试套件更新。

### 基本原理
通过 Git 提交将上述分散的重构动作合并为一个逻辑完整的工作单元。这标志着 Phase 2 路线图任务的正式终结。

### 标签
#intent/refine #flow/ready #priority/high #comp/engine #comp/ui #comp/tests #scope/core #scope/performance #ai/instruct #task/domain/storage #task/object/indexed-db-modernization #task/action/implementation #task/state/end

---

### Script

#### Acts 1: 提交变更

我们将所有受影响的文件添加到暂存区，并创建一个详细描述重构内容的提交。

~~~~~act
run_command
~~~~~
~~~~~
git add src/constants.js src/main.js src/state.js src/storage/index.js src/storage/indexed-db-adapter.js src/ui/dom.js src/ui/events.js src/ui/index.js src/ui/renderer.js src/ui/templates.js tests/state.test.js tests/ui.clean_duplicates.test.js tests/ui.integration.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
refactor: transition to incremental IndexedDB storage and async UI flow

This major refactor moves the application away from a monolithic, memory-heavy state management system towards a modern, database-driven architecture.

Key Changes:
- Database: Upgraded schema to v2, adding composite indexes [server, channel, time] and [server, channel] for O(1) page access and fast directory listing.
- Storage: Implemented incremental 'putMessage' and cursor-based pagination, replacing the expensive 'saveAllV6' (full clear + rewrite) logic.
- Runtime: Completely removed 'inMemoryChatState' and the 30s auto-save timer. Messages are now persisted immediately upon parsing.
- UI Layer: Fully decoupled UI from global state. The renderer now requests data asynchronously through the adapter. Removed the obsolete 'Save Now' button.
- Logic: Refactored synthetic channel assignment into a pure function 'getSyntheticChannelName'.
- Stability: Added defensive checks for IDBKeyRange parameters and updated the test suite to comply with the new async contracts.

Performance Impact:
- Dramatically reduced JS heap usage as full history is no longer held in memory.
- Eliminated periodic UI freezes caused by JSON serialization of large archives.
- Prepared the codebase for Phase 3 (Web Worker offloading).
~~~~~

### 下一步建议

Phase 2 现已正式结项。你的系统目前已经具备了处理超大规模聊天记录的能力，且内存表现非常优秀。

**下一步建议 (Phase 3: 性能巅峰)**：
我们将开始 **Web Worker** 的引入工作。虽然现在的 IDB 操作是异步的，但它们依然在主线程执行序列化工作。在 Phase 3 中，我们将把整个 `IndexedDBAdapter` 搬进 Worker 线程，实现真正的“零主线程阻塞”存储引擎。

如果你准备好进行这项挑战，请告诉我，我们将开始设计 Worker RPC 通信协议。
