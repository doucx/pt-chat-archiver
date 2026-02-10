好的，我们已经完成了 UI 瘦身、设置项迁移以及存档安全性的增强逻辑。现在是将这些更改作为一个完整的逻辑单元提交到版本控制系统的时候了。

## [COMMIT] refactor(ui): 瘦身主界面并增强存档管理与安全性功能

### 用户需求
1.  **UI 瘦身**: 将非核心信息（版本、录制状态）和低频操作（下载）移入设置页面，并使用 Emoji 替代按钮文字以节省空间。
2.  **安全增强**: 提供“立即保存”功能、可配置的自动保存间隔，并实时显示上次保存时间。
3.  **Bug 修复**: 修正 V6 架构下下载功能无法处理服务器层级数据的错误。
4.  **结构优化**: 将模板文件移入 UI 子目录。

### 评论
这次重构不仅提升了界面的精致感，更通过增强透明度（显示保存时间）和控制权（手动保存/间隔设置）显著改善了用户对数据安全的心理预期。

### 目标
1.  将所有修改过的源文件添加到 Git 暂存区。
2.  创建一个包含详细变更说明的提交记录。

### 基本原理
我们遵循了“核心操作最小化，管理操作深层化”的原则。通过 `git_commit` 将这些涉及 UI 交互、数据结构修复和逻辑重构的变动固化下来。

### 标签
#intent/refine #intent/build #intent/fix #flow/ready #priority/medium #comp/ui #comp/build #scope/ux #ai/instruct #task/domain/ui #task/object/ui-overhaul #task/action/commit #task/state/end

---

### Script

#### Acts 1: 添加更改到暂存区

我们将涉及 UI 逻辑、模板、存储配置以及主程序的所有更改一并添加。

~~~~~act
git_add
src
~~~~~

#### Acts 2: 提交变更

~~~~~act
git_commit
~~~~~
~~~~~text
refactor(ui): streamline interface and enhance data safety features

- UI Refactor: Replaced text-heavy buttons with compact Emoji icons and tooltips to maximize screen real estate for logs.
- Information Architecture: Moved app metadata (version, recording status) and infrequent actions (Download) into the settings panel.
- Data Safety:
  - Added "Save Now" manual trigger.
  - Added configurable auto-save intervals (5s to 1h).
  - Added "Last Saved" timestamp display in settings for better user feedback.
- Bug Fix: Fixed a crash in the download function caused by incorrect traversal of V6's server-nested data structure.
- Structural Cleanup: Relocated 'templates.js' to 'src/ui/' for better modularity.
~~~~~

### 下一步建议
- **多标签页同步**: 目前多个标签页同时开启时，自动保存可能会发生覆盖。建议下一步研究基于 `storage` 事件的跨标签页状态同步机制。
- **UI 预设**: 考虑添加“简约/完整”模式切换，让用户一键在 Emoji 模式和带文字的传统模式间切换。
- **发布准备**: 既然版本号已经移动到了设置页，可以考虑更新 `package.json` 的版本号准备发布 6.2.0。
