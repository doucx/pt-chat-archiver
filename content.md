好的，既然所有功能已经过验证，我们现在正式将这些改动持久化到代码库中。

我们将版本号从 `7.5.7` 升级至 `7.6.0`，以体现此次重大的架构升级（引入状态机）和显著的功能改进（加载进度条）。

## [COMMIT] feat: 实现加载进度条并重构引擎生命周期状态机

### 用户需求

提交并发布包含 TUI 进度条和状态机重构的稳定版本。

### 评论

此次更新是 `v7` 分支的一个重要里程碑。通过分片读取机制解决了长列表加载的焦虑感，并通过 `ArchiverMachine` 彻底解决了自项目初期以来一直存在的、由于 DOM Mutation 异步特性导致的各种潜在竞态条件。

### 目标

1. 更新 `package.json` 版本号至 `7.6.0`。
2. 提交所有涉及进度条实现、接口调整及状态机重构的代码文件。

### 基本原理

遵循 `[COMMIT]` 规范，仅包含 Git 相关的 Act 操作。通过详尽的 Commit Message 记录本次改动的核心逻辑。

### 标签

#intent/build #intent/refine #flow/ready #priority/high #comp/runtime #comp/ui #concept/state #scope/ux #scope/dx #ai/instruct #task/domain/release #task/object/v7.6.0 #task/action/commit #task/state/end

---

### Script

#### Acts 1: 更新版本号

我们将版本号提升至 `7.6.0`。

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
  "name": "pt-chat-archiver",
  "private": true,
  "version": "7.5.7",
  "type": "module",
~~~~~
~~~~~json.new
  "name": "pt-chat-archiver",
  "private": true,
  "version": "7.6.0",
  "type": "module",
~~~~~

#### Acts 2: 提交变更

将所有改动的文件添加到暂存区并生成正式提交。

~~~~~act
git_add
package.json
src/machine.js
src/storage/indexed-db-adapter.js
src/storage/index.js
src/main.js
src/ui/index.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat: implement TUI progress bar and refactor engine with state machine

This update significantly improves the user experience and internal stability:

1. UI Improvements:
   - Added a TUI-style progress bar during message loading (e.g., "[####--] 66%").
   - Implemented chunked data fetching in 'getMessages' to prevent UI freezing on mobile devices.
   - Added transitional feedback during the text rendering phase.

2. Architecture Refactoring:
   - Introduced 'ArchiverMachine' (FSM) to manage the engine's lifecycle.
   - Replaced scattered boolean flags with formal states: STOPPED, STARTING, TAB_SWITCHING, and RECORDING.
   - Centralized the concurrency lock for historical scanning.
   - Fixed a long-standing race condition where rapid tab switching could lead to inconsistent recording states.

3. Performance & Robustness:
   - Optimized 'IndexedDBAdapter' to support segmented transactions for progress reporting without losing performance on bulk reads.
   - Improved the monotonic clock stepper and batch monotonicity during historical sweeps.

Version bumped to 7.6.0.
~~~~~

### 下一步建议

- **生产测试**: 建议在实际 Pony Town 环境中进行一次长时间（超过 1 小时）的挂机测试，观察状态机在遇到意外重连或长时间静默后的恢复能力。
- **性能监控**: 观察分片读取（Chunked Read）对手机电池消耗的影响，必要时可微调 `chunkSize`（当前为 250）。
- **发布存档**: 此时是导出一份全量 JSON 存档作为版本里程碑备份的好时机。
