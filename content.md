好的，这两个关于服务器导航的 UI 增强功能已经实现完毕。它们极大地优化了多服务器存档管理的用户体验，让“正在录制”的状态变得清晰可见，并提供了快速回归当前上下文的便捷途径。

我将生成一个 `[COMMIT]` 计划，将这些 UI 优化正式提交到代码库。

## [COMMIT] feat(ui): enhance server selection with status highlights and reset shortcut

### 用户需求
提交两个 UI 优化功能：
1. 在服务器选择下拉菜单中为当前正在记录的服务器添加“（正在记录）”标识。
2. 在服务器选择器旁添加一个定位按钮 (📍)，用于快速跳转回当前活跃服务器的视图。

### 评论
这些微调虽然体量不大，但对于提升 v6 架构在多服务器环境下的易用性至关重要。它们通过视觉反馈和快捷操作，显著降低了用户在多个存档间切换时的迷失感。

### 目标
1. 将涉及 UI 渲染、模板定义和事件绑定的四个文件添加到暂存区。
2. 创建一个清晰描述这些 UI 改进的 Git 提交。

### 基本原理
根据 Quipu 执行协议，所有逻辑改动验证完成后，需通过独立的 `[COMMIT]` 计划进行持久化。这确保了每一个功能点的变更在版本控制系统中都是原子的且可追溯的。

### 标签
#intent/tune #flow/ready #priority/medium #comp/ui #concept/navigation #scope/ux #ai/instruct #task/domain/ui #task/object/server-navigation #task/action/refine #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交 UI 增强变更

我们将修改过的 UI 相关文件添加到 Git 暂存区并提交。

~~~~~act
git_add
src/templates.js
src/ui/dom.js
src/ui/events.js
src/ui/renderer.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat(ui): enhance server selection with status highlights and reset shortcut

Refined the multi-server navigation experience with two key UI improvements:
- Added a "(正在记录)" suffix to the currently active server in the server view selector dropdown for better status visibility.
- Implemented a "Return to Active Server" button (📍) next to the selector, allowing users to instantly switch back to the recording server's view.
- Added intelligent state control to the reset button, disabling it when already viewing the active server or when not in game.

These changes improve the usability of the v6 architecture by providing clearer feedback and faster navigation between historical archives and live data.
~~~~~

### 下一步建议
- **核心功能已稳固**: v6 的分层存储、自动检测、数据隔离和 UI 导航功能现在都已完整且经过优化。
- **存储清理建议**: 现在可以考虑进行一次代码清理，移除 `src/state.js` 中那些已经不再适用的 v4 迁移逻辑，以保持核心逻辑的纯净。
- **性能监控**: 随着分层存档的增加，建议关注 V6 结构在大型存档下的解析性能，未来可以考虑引入分块加载或更高效的数据存储后端（如 IndexedDB）。
