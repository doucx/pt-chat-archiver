好的，我们已经完成了所有核心逻辑的实现和错误修复。现在我们将更新版本号并提交这些更改。

我将生成一个 `[COMMIT]` 计划来收尾。

## [COMMIT] feat: 支持自定义统计上限与读取分片大小

### 用户需求
1.  更新项目版本号以反映新增功能。
2.  提交所有更改到 Git 仓库。

### 评论
这次更新显著提升了在处理大规模存档数据时的性能可控性。通过将 `statsLimit` 和 `readChunkSize` 暴露给用户，系统能够更好地适应不同性能水平的设备，同时也为未来的性能优化奠定了基础。

### 目标
1.  将 `package.json` 中的版本号从 `7.6.0` 升级至 `7.7.0`。
2.  暂存所有受影响的文件并创建一个清晰的提交记录。

### 基本原理
按照语义化版本规范 (SemVer)，由于我们增加了新的配置项并改变了内部读取机制（属于功能性新增且向下兼容），我们将次版本号（Minor version）进行递增。

### 标签
#intent/build #flow/ready #priority/medium #comp/build #scope/core #ai/instruct #task/domain/storage #task/object/configuration #task/action/extension #task/state/end #task/status/completed

---

### Script

#### Acts 1: 更新版本号

将 `package.json` 的版本号更新为 `7.7.0`。

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
  "name": "pt-chat-archiver",
  "private": true,
  "version": "7.6.0",
  "type": "module",
~~~~~
~~~~~json.new
  "name": "pt-chat-archiver",
  "private": true,
  "version": "7.7.0",
  "type": "module",
~~~~~

#### Acts 2: 提交变更

暂存相关文件并生成提交记录。

~~~~~act
git_add
package.json
src/ui/templates.js
src/ui/dom.js
src/ui/state.js
src/ui/events.js
src/storage/indexed-db-adapter.js
src/ui/index.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat: support custom stats limit and read chunk size in settings

This update introduces two new configuration options to the settings UI:
1. Statistics Limit: Allows users to cap the number of messages analyzed for reports (default: 5000), preventing UI freezes on large datasets.
2. Read Chunk Size: Exposes the internal database read step size (formerly hardcoded at 250) for performance tuning.

Changes:
- Added number inputs for these settings in templates.js.
- Implemented state persistence and UI sync in state.js and events.js.
- Refactored IndexedDBAdapter to use dynamic chunk sizes and support offset-based fetching.
- Optimized refreshView controller to perform partial fetches for statistics mode using calculated offsets.
- Bumped version to 7.7.0.
~~~~~

### 下一步建议
- **发布准备**: 既然版本号已经更新，你可以运行 `npm run build` 生成生产环境的脚本文件（例如用于油猴脚本的分发版本）。
- **用户反馈**: 观察在大规模数据下的运行表现，如果 5000 条的默认统计上限仍然过重，可以建议用户在设置中调低此值。
