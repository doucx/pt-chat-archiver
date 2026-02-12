好的，我们已经完成了“导入存档”功能的开发与交互优化。现在将这些更改作为一个完整的逻辑单元提交到 Git 仓库。

## [COMMIT] feat(ui): 实现存档导入功能及状态同步机制

### 用户需求
提交并固化新开发的“导入存档”功能，确保用户能够通过 JSON 文件恢复历史数据。

### 评论
这次提交涵盖了从 UI 模板更新、DOM 绑定、异步文件读取逻辑到全局状态同步机制的完整实现。通过引入 `replaceState` 回调，解决了导入后可能出现的内存对象不同步问题，并提供了符合项目风格的非阻塞交互反馈。

### 目标
1.  将受影响的源文件添加到 Git 暂存区。
2.  创建一个包含详细说明的提交。

### 基本原理
按照项目规范，将所有相关的修改（`main.js` 中的架构调整、`ui/` 下的逻辑与表现层修改）合并提交。

### 标签
#intent/build #flow/done #priority/medium #comp/ui #comp/storage #scope/ux #ai/delegate #task/domain/ui #task/object/import-feature #task/action/integration #task/state/end

---

### Script

#### Acts 1: 提交变更

我们将所有涉及导入功能修改的文件添加到暂存区并执行提交。

~~~~~act
git_add
src/main.js
src/ui/templates.js
src/ui/dom.js
src/ui/index.js
src/ui/events.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat(ui): implement archive import feature with state synchronization

- Added "Import Archive" button to the settings panel.
- Implemented file reading logic using FileReader API.
- Integrated high-risk operation warnings (double-confirm) before overwriting data.
- Introduced `replaceState` callback in `createUI` to ensure the global `inMemoryChatState` is updated upon import.
- Replaced modal alerts with non-blocking button text feedback for a better UX.
- Ensured the file picker is triggered correctly by adhering to browser user-activation policies.
~~~~~

### 下一步建议
- **回归测试**: 建议手动执行一次“导出 -> 清空 -> 导入”的完整流程，验证在 IndexedDB 环境下大数据量导入的性能表现。
- **文档更新**: 如果有用户手册或 README，建议更新说明，告知用户如何利用导出/导入功能进行跨设备存档迁移。
