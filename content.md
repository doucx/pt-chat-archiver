我们已经完成了对 UI 架构的重构以及一系列深度交互优化。现在将这些变更作为一个完整的逻辑单元提交到版本库中。

## [COMMIT] feat(ui): 增强只读模式体验并实现智能吸附翻页逻辑

### 用户需求
将近期完成的 UI 重构、只读模式增强、服务器自动跟随功能以及智能“吸附到底部”分页逻辑正式提交。

### 评论
这次更新显著提升了 pt-chat-archiver 的成熟度。特别是“吸附到底部”模式的实现，结合了主动触发与隐式感知的交互设计，使工具在处理实时高频聊天数据时的体验更接近原生聊天应用。同时，代码结构的重构（CSS 归位）也提升了项目的维护性。

### 目标
1.  将所有修改后的 UI 模块文件及重构后的 CSS 文件添加到 Git 暂存区。
2.  创建一个详尽的提交说明，记录本次 UI/UX 的重大演进。

### 基本原理
按照 Quipu 协议的要求，在功能开发和验证完成后，通过一个独立的 `[COMMIT]` 计划来固化成果。这确保了版本历史的清晰，并允许我们在一个干净的状态下开启下一个阶段的任务。

### 标签
#intent/refine #intent/build #flow/ready #priority/high #comp/ui #concept/ui #scope/ux #scope/dx #ai/instruct #task/domain/ui #task/object/ui-ux-enhancement #task/action/integration #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交 UI 与重构变更

我们将所有涉及到的文件添加到暂存区并提交。注意：由于 `src/style.css` 已移动，Git 会自动识别此重命名操作。

~~~~~act
git_add
src/main.js
src/ui/style.css
src/ui/templates.js
src/ui/dom.js
src/ui/events.js
src/ui/renderer.js
src/ui/state.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat(ui): enhance read-only UX and implement smart stick-to-bottom logic

This commit introduces significant UI/UX improvements and refactors the stylesheet structure.

Key Changes:
- **Refactoring**: Moved `src/style.css` to `src/ui/style.css` for better module isolation.
- **Read-Only Mode**: 
    - Replaced the intrusive top banner with a subtle background watermark ("ARCHIVE READ-ONLY").
    - Added a 📍 button and status indicator to the main log view for quick return to the active server.
    - Hidden the pause button in read-only mode to prevent ambiguity.
- **Auto-Follow Server**: 
    - Added a feature to automatically switch the UI view when the active game server changes.
    - Introduced a configuration toggle in the settings (default: ON).
- **Smart Stick-to-Bottom Paging**:
    - Enhanced the `>>` button to activate a "Locked to Bottom" mode with visual feedback (green background).
    - Implemented automatic paging and scrolling while in locked mode.
    - Added smart interaction: manually scrolling to the bottom on the last page auto-locks the view, while scrolling up auto-unlocks it.
- **Layout Optimization**: Fixed the server reset button layout for mobile devices to prevent horizontal overflow.
~~~~~

### 下一步建议

本阶段的 UI 优化已圆满完成。建议下一步的方向：
- **性能剖析**: 随着数据量的增加，可以开始关注 `renderer.js` 在处理超长频道（如超过 50,000 条消息）时的渲染性能，并考虑引入虚拟列表（Virtual List）技术。
- **数据导出增强**: 目前支持 JSON 和纯文本导出，可以考虑添加按时间范围导出或按关键词过滤后导出的功能。
- **多语言支持**: 随着 UI 元素的增多，可以考虑引入简单的 i18n 机制以支持英文界面。
