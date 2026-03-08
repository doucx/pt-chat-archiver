好的，性能重构的第四阶段（高级功能重构）已经圆满完成。我们通过异步分片扫描和常数时间存储估算，彻底解决了大数据量下的 UI 冻结风险。

现在，我将生成一个 `[COMMIT]` 计划，将这些关键的架构改进永久保存到 Git 历史中。

## [COMMIT] refactor(analysis): optimize duplicate scanning and storage estimation

### 用户需求
将第四阶段（高级功能重构）的所有代码变更提交到 Git 仓库。

### 评论
这次提交标志着性能重构路线图核心部分的终结。我们成功的将系统中最后几个沉重的同步操作（查重扫描和空间计算）转变为现代的、非阻塞的异步模型。这不仅提升了性能，也极大地改善了在极端数据量下的用户体验（UX）。

### 目标
1.  将所有修改过的源文件和测试文件添加到暂存区。
2.  创建一个包含详尽说明的提交，记录从同步内存操作到异步数据库操作的转变。

### 基本原理
遵循“脚本与 Git 操作互斥”的原则，在一个独立的计划中执行提交。这将确保所有之前的修改已就绪，并提供一个干净、逻辑完整的历史记录。

### 标签
#intent/refine #flow/ready #priority/high #comp/engine #comp/ui #concept/state #concept/executor #scope/core #scope/ux #ai/delegate #task/domain/storage #task/object/analysis-refactor #task/action/integration #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交重构变更

我们将所有涉及第四阶段重构的文件添加到暂存区并进行提交。

~~~~~act
git_add
src/storage/indexed-db-adapter.js
src/storage/index.js
src/analysis.js
src/ui/templates.js
src/ui/renderer.js
src/ui/events.js
src/ui/index.js
src/main.js
tests/ui.clean_duplicates.test.js
tests/ui.integration.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
refactor(analysis): optimize duplicate scanning and storage estimation

This commit completes Phase 4 of the performance roadmap by refactoring the last remaining memory-heavy synchronous operations into asynchronous, database-driven workflows.

Key Changes:
- Implemented `scanAllDuplicatesAsync` in `analysis.js` using an asynchronous chunking algorithm (5000 records per slice) with `setTimeout(0)` to yield the main thread, preventing UI freezing during large scans.
- Replaced O(N) `getRawSize` (which used JSON serialization of all data) with an O(1) estimation based on message count, eliminating massive memory spikes.
- Updated `IndexedDBAdapter` with `getMessagesChunk` and `deleteMessages` to support targeted data maintenance.
- Overhauled the "Clean Duplicates" UI flow into a three-stage state machine: Scan -> Preview Count -> Execute Deletion.
- Removed legacy `getRawState` and `detectTotalDuplicates` synchronous hooks from the UI, fully decoupling the renderer from the global state.
- Updated all integration and unit tests to align with the new asynchronous maintenance API.

This transition ensures that pt-chat-archiver remains responsive even with archives containing hundreds of thousands of messages.
~~~~~

### 下一步建议
- **性能基准测试**：建议在真实的高负载环境（例如拥有 10W+ 记录的数据库）中运行脚本，观察扫描过程中的帧率变化。
- **全文搜索预览**：既然现在已经有了高效的分片读取机制，下一步可以考虑探索如何在不加载全部内存的情况下实现基础的关键词过滤功能。
