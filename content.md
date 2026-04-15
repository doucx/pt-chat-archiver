好的，我们已经完成了锁定逻辑的修复和相关的测试覆盖。现在我将版本号更新为 `7.5.7` 并创建一个完整的 Git 提交。

## [COMMIT] fix(ui): 修复滚动锁定失效 bug 并引入乐观 UI 更新

### 用户需求
更新项目版本号并提交所有修复代码。

### 评论
此次修复解决了由于异步加载导致的 UI 竞态问题，并通过乐观更新显著提升了分页操作的响应感。

### 目标
1.  将 `package.json` 中的版本号提升至 `7.5.7`。
2.  将 `src/ui/events.js`、`tests/ui.integration.test.js` 和 `package.json` 的更改提交到 Git。

### 基本原理
遵循语义化版本控制，由于这是一个 Bug 修复，我们提升修订号。通过 Git 提交将这些逻辑变更持久化。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #comp/build #scope/dx #ai/instruct #task/domain/ui #task/object/version-bump #task/action/commit #task/state/end #task/status/completed

---

### Script

#### Acts 1: 更新版本号

我们将 `package.json` 中的版本号从 `7.5.6` 修改为 `7.5.7`。

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
  "name": "pt-chat-archiver",
  "private": true,
  "version": "7.5.6",
  "type": "module",
~~~~~
~~~~~json.new
  "name": "pt-chat-archiver",
  "private": true,
  "version": "7.5.7",
  "type": "module",
~~~~~

#### Acts 2: 提交代码变更

我们将所有相关修改添加到暂存区并生成提交记录。

~~~~~act
git_add
src/ui/events.js
tests/ui.integration.test.js
package.json
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
fix(ui): prevent accidental scroll-lock release during loading

- Added a guard in the scroll event listener to ignore scroll events triggered by the "loading" placeholder (⏳), preventing race conditions during asynchronous data fetching.
- Implemented Optimistic UI for pagination buttons: the lock state (active class) is now toggled synchronously upon click for better responsiveness.
- Updated integration tests to cover the loading-state scroll protection.
- Bumped version to 7.5.7.
~~~~~

### 下一步建议
- **构建发布**: 现在可以运行 `npm run build` 生成生产环境的脚本文件。
- **用户反馈**: 在新版本发布后，关注移动端用户（特别是那些开启了高“初始化防抖延迟”的用户）对滚动锁定的反馈。
