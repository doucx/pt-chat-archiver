好的，代码重构已完成。现在我将生成一个 `[COMMIT]` 计划，将这些更改提交到 Git 仓库。

## [COMMIT] refactor: 迁移录制状态显示至设置面板

### 用户需求
完成代码重构后，将更改提交到版本控制系统。

### 评论
这次重构通过将状态信息从全局标题栏移动到设置面板，简化了主界面。这是向更专业、更整洁的 UI 迈进的一步，同时也确保了信息在最相关的上下文（配置与维护）中可用。

### 目标
1.  将修改后的组件文件添加到 Git 暂存区。
2.  创建一个清晰、符合规范的提交说明。

### 基本原理
遵循 `[COMMIT]` 计划规范，该阶段仅包含 Git 操作，确保在提交前已经过验证。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #scope/ux #ai/delegate #task/domain/ui #task/object/status-display #task/action/refactor #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交变更

我们将修改后的 UI 组件提交到仓库。

~~~~~act
git_add
src/ui/components/Header.jsx
src/ui/components/ConfigPanel.jsx
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
refactor(ui): relocate recording status from Header to ConfigPanel

Moves the active server and recording channel status display from the global Header component to the top of the ConfigPanel.

This cleanup:
- Simplifies the Header UI by removing the bottom status bar.
- Centralizes diagnostic and status information within the settings view, where it provides better context for data maintenance tasks.
- Reduces redundant signal subscriptions in the main log viewing path.
~~~~~

### 下一步建议
- **UI 润色**: 既然 Header 现在更窄了，可以考虑微调日志查看器的内边距，以利用释放出来的垂直空间。
- **功能扩展**: 在 `ConfigPanel` 的状态显示区，未来可以增加一个“点击复制当前服务器信息”的功能。
