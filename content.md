好的，服务器捕获逻辑的健壮性改进已经开发并测试完毕。现在我们将这些变更作为一个完整的逻辑单元提交到仓库中。

## [COMMIT] feat: 实现服务器名称的持久化与启动恢复机制

### 用户需求
完成对服务器检测逻辑的重构，确保在快速进入游戏等极端竞态条件下，记录器仍能通过持久化的历史记录正确恢复上下文并激活。

### 评论
这个提交不仅修复了一个实际存在的竞态 Bug，还增强了系统的整体状态一致性。通过将“最后一次服务器”纳入持久化管理，我们为未来可能的离线分析和多端状态同步打下了基础。

### 目标
1. 提交 `src` 目录下的逻辑变更。
2. 提交配套的单元测试与集成测试。

### 基本原理
我们将所有受影响的文件（常量定义、存储适配器、主程序逻辑、测试脚本）添加至暂存区。提交信息详细描述了解决竞态问题的技术方案：即“恢复优先”的启动序列配合“双重检查”的回退机制。

### 标签
#intent/build #flow/ready #priority/high #comp/engine #comp/storage #comp/tests #concept/state #scope/core #ai/instruct #task/domain/engine #task/object/server-detection #task/action/robustness-fix #task/state/end #task/status/completed

---

### Script

#### Acts 1: 暂存并提交变更

我们将所有相关修改添加到 Git 暂存区并创建提交。

~~~~~act
git_add
src/constants.js
src/storage/indexed-db-adapter.js
src/storage/local-storage.adapter.js
src/storage/index.js
src/main.js
tests/storage.test.js
tests/server_recovery.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat: implement server name persistence and recovery

- Added `last_server` persistence in IndexedDB and LocalStorage adapters.
- Refactored `main.js` startup sequence to prioritize context recovery from storage.
- Implemented immediate storage updates when a new server is detected in the DOM.
- Introduced a fallback mechanism in `activateLogger` to use the persisted server name if DOM detection fails during entry.
- Added comprehensive unit tests and a new integration test to verify the recovery logic.

This resolves a race condition where the recorder would fail to activate if the user entered the game faster than the script could capture the server name from the UI.
~~~~~

### 下一步建议
- **回归测试**：在真实环境下进行多次快速重连测试，观察记录器是否能在 DOM 节点刷新前就进入就绪状态。
- **性能监控**：由于在启动时增加了 IDB 读取操作，可以观察在低端设备上的初始化耗时是否受到显著影响。
