好的，我们已经完成了设置页面的添加、UI 布局的重构以及交互细节的优化。现在是时候将这些更改作为一个完整的逻辑单元提交到版本库了。

## [COMMIT] feat: 实现设置页面、UI 布局重构及动态分页支持

### 用户需求
将用户昵称、分页大小、清空存档等管理功能整合到独立的设置页面中，并优化统计视图的交互反馈。

### 评论
这次更新显著提升了工具的可维护性和用户体验。通过引入视图切换机制，我们不仅使主界面更加清爽，还为未来添加更多配置项打下了坚实的基础。

### 目标
1.  提交对 `src/constants.js` 的修改（新增 `CONFIG_KEY`）。
2.  提交对 `src/style.css` 的修改（新增设置页样式和按钮状态）。
3.  提交对 `src/templates.js` 的重构（引入视图容器结构）。
4.  提交对 `src/ui.js` 的大幅重构（实现视图切换、配置持久化和动态分页）。

### 基本原理
我们将所有变更打包在一个提交中，因为它们共同构成了一个完整的特性：设置系统及其配套的 UI 重构。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #concept/config #scope/ux #ai/instruct #task/domain/ui #task/object/settings-view #task/action/implementation #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交变更

我们将所有修改过的源文件添加到暂存区并创建提交。

~~~~~act
git_add
src/constants.js
src/style.css
src/templates.js
src/ui.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat(ui): implement settings page and reorganize UI layout

- Added a new Settings view to house configuration and maintenance tasks.
- Moved 'Self Name', 'Page Size', and 'Clear Archive' controls to the settings page.
- Implemented persistent configuration using localStorage (CONFIG_KEY).
- Refactored UI templates to support multi-view switching (Log, Stats, Config).
- Improved 'Statistics' button feedback: it now toggles between 'Stats' and 'Records' with proper color highlighting.
- Added real-time storage usage display in the settings page.
- Removed the redundant manual refresh button as the system now handles synchronization automatically.
- Enhanced pagination logic to respond dynamically to changes in page size.
~~~~~

### 下一步建议
- **版本发布**: 既然这是一个大的特性更新，你可以考虑更新 `package.json` 中的版本号并发布新版脚本。
- **性能监控**: 观察大分页设置下（如 5000+ 条/页）DOM 渲染的压力，未来可能需要引入虚拟滚动（Virtual Scrolling）。
