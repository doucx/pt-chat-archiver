好的，Phase 3 的核心代码修改已经全部就绪。

这次更新彻底改变了存档器的数据组织方式，从扁平结构升级到了按服务器隔离的嵌套结构，并提供了完善的迁移路径和 UI 交互支持。这标志着 v6 架构升级中最艰难的部分已经顺利完成。

我将生成一个 `[COMMIT]` 计划，将这些变更提交到仓库。

## [COMMIT] feat: implement server-aware recording and V5-to-V6 migration

### 用户需求
根据已完成的 Phase 3 实施代码，提交所有关于服务器感知录制、数据隔离存储、跨服务器查看以及 V5 到 V6 数据迁移的变更。

### 评论
这是项目的一个里程碑。它不仅解决了多服务器数据混淆的问题，还通过迁移算法保护了老用户的历史资产，同时通过 `setState` 模式提升了架构的健壮性。

### 目标
1. 提交所有涉及 v6 架构升级的核心逻辑变更。
2. 确保 Git 历史记录清晰地反映了这次重大的功能演进。

### 基本原理
按照 Quipu 协议，在所有逻辑修改完成后，通过一个独立的计划执行 Git 提交操作。这有助于保持变更的可追溯性和原子性。

### 标签
#intent/build #flow/ready #priority/high #comp/engine #comp/ui #comp/runtime #concept/state #concept/navigation #scope/core #ai/instruct #task/domain/storage #task/object/v6-migration #task/action/implementation #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交 Phase 3 核心变更

我们将涉及到的所有文件添加到暂存区并创建提交。

~~~~~act
git_add
src/constants.js
src/main.js
src/state.js
src/storage.js
src/templates.js
src/ui/dom.js
src/ui/events.js
src/ui/index.js
src/ui/renderer.js
src/ui/state.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat(core): implement server-aware recording and V5-to-V6 migration

This major architectural update introduces the v6 storage schema, which organizes chat logs by game server (Server -> Channel -> Messages).

Key changes:
- Data Isolation: Messages are now recorded into server-specific namespaces based on real-time DOM detection.
- Migration Path: Implemented an interactive migration flow that allows users to move their legacy V5 (flat) data into the new V6 structure for a specific server.
- Multi-Server Viewer: Enhanced the UI with a server selector in the settings, allowing users to view archives from different servers in a 'Read-only' mode.
- State Sync: Introduced a 'setState' bridge between the main logic and UI module to ensure robust data synchronization when the state tree is replaced.
- Storage Driver: Updated to support V6 keys, proper cleanup of V5 data, and accurate storage usage calculation.

This upgrade resolves the long-standing issue of data overlapping in multi-server environments.
~~~~~

### 下一步建议
- **回归测试**: 建议在不同服务器环境下运行脚本，验证录制是否完全隔离，以及 UI 的只读提示是否准确。
- **清理与优化**: 在 v6 稳定运行一个周期后，可以考虑移除 `src/state.js` 中极其古老的 `migrateDataV4toV5` 逻辑，进一步精简代码库。
- **文档更新**: 如果有外部用户手册，请更新关于“多服务器支持”的使用说明。
