好的。我们已经完成了 Phase 1 的所有核心工作，包括 UI 架构的异步化改造、Renderer 的纯函数化以及测试套件的全面适配。现在我们将这些变更整合为一个完整的、逻辑统一的提交。

## [COMMIT] refactor(ui): decouple UI from global state with async DataAdapter (Phase 1)

### 用户需求
将 Phase 1 的所有架构重构合并为一个宏观提交，并提供详尽的说明，以记录从单体同步状态向异步数据驱动架构的转变。

### 评论
这个提交标志着项目架构演进的一个里程碑。我们成功地在不破坏现有功能的前提下，完成了最困难的“地基改造”——让 UI 不再感知数据的物理存储方式。这为后续引入 Web Worker 和 IndexedDB 增量读写扫清了障碍。

### 目标
1.  提交 `main.js` 中关于 `DataAdapter` 接口的定义。
2.  提交 `ui/index.js` 和 `events.js` 中关于异步刷新逻辑 (`refreshView`) 的实现。
3.  提交 `renderer.js` 中关于 `RenderContext` 展示逻辑的解耦。
4.  包含所有修复异步渲染时序和数据健壮性的补丁。
5.  同步更新所有测试用例，确保 CI 环境下的稳定性。

### 基本原理
通过合并提交，我们确保了代码仓库的历史逻辑清晰。Phase 1 的本质是“接口抽象层”的引入。通过 `DataAdapter`，我们定义了 UI 与数据层通信的契约；通过异步化，我们解决了主线程锁定的潜在风险。

### 标签
#intent/refine #flow/ready #priority/high #comp/ui #comp/runtime #comp/tests #scope/core #ai/instruct #task/domain/ui #task/object/rendering-pipeline #task/action/async-refactor #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交 Phase 1 完整重构

我们将所有相关的源文件和测试文件添加到暂存区，并创建一个内容丰富的合并提交信息。

~~~~~act
git_add
src/main.js
src/ui/renderer.js
src/ui/events.js
src/ui/index.js
tests/ui.clean_duplicates.test.js
tests/ui.integration.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
refactor(ui): decouple UI from monolithic state with async DataAdapter (Phase 1)

This massive refactor marks the completion of Phase 1 of the Performance Roadmap. The primary goal was to decouple the UI rendering pipeline from the global `inMemoryChatState` object and prepare the codebase for Web Worker and streaming IndexedDB integration.

Key changes:
1. DataAdapter Abstraction: Introduced a 'DataAdapter' interface in 'main.js' that acts as an asynchronous bridge between the storage layer and the UI. This encapsulates all data fetching logic (servers, channels, paginated messages).
2. Asynchronous UI Controller: Rewrote 'ui/index.js' to manage state via a centralized, asynchronous 'refreshView' function. The UI no longer assumes data is present in memory; it requests what it needs.
3. Pure Functional Renderer: Refactored 'renderer.js' to accept a 'RenderContext' containing only the data required for the current view. Removed all pagination and slicing logic from the view layer.
4. Robustness and Error Handling: Enhanced 'formatMessageForDisplay' to safely handle partial or malformed message data, which is crucial during asynchronous initialization and migration phases.
5. Testing Suite Modernization: 
   - Updated integration and regression tests to use Mock Adapters instead of plain state objects.
   - Refactored assertions to be asynchronous, using 'waitFor' and 'findBy' to eliminate race conditions in the new rendering pipeline.
   - Ensured 'createUI' awaits the initial render before returning, guaranteeing a predictable state for both tests and production.

This infrastructure change allows us to move full-speed into Phase 2 (Database Modernization) without further modifying the UI layer's core logic.
~~~~~

### 下一步建议

**Phase 1 已经正式结项。** 我们的技术栈现在已经具备了“按需加载”的能力。

下一步，我建议开始 **Phase 2: 数据库层现代化** 的第一步：
1.  **重构 `IndexedDBAdapter`**: 实现基于游标的增量分页查询接口 (`getMessagesByPage`)。
2.  **重构写入逻辑**: 实现 `putMessage` 增量写入，并将其直接挂载到 Parser 的新消息回调中，从而废弃现有的全量 `saveAllV6` 定时器。

如果你准备好了，我们可以开始设计 Phase 2 的第一个实施计划。
