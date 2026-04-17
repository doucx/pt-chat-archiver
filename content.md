好的，我们已经成功实现了分页缓存机制并完成了逻辑集成。现在，我们将版本号提升至 `7.8.0` 并提交这些更改。

## [COMMIT] feat: 实现支持实时补水的可配置内存分页缓存

### 用户需求
更新版本号并提交代码。

### 目标
1.  将 `package.json` 中的版本号更新为 `7.8.0`。
2.  将所有相关修改添加到 Git 暂存区。
3.  创建一个详细的 Git Commit，记录关于缓存系统和补水机制的实现。

### 标签
#intent/build #flow/ready #priority/medium #comp/build #scope/core #ai/instruct #task/domain/devops #task/object/version-bump #task/action/commit #task/state/end

---

### Script

#### Acts 1: 更新版本号

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
  "name": "pt-chat-archiver",
  "private": true,
  "version": "7.7.0",
  "type": "module",
~~~~~
~~~~~json.new
  "name": "pt-chat-archiver",
  "private": true,
  "version": "7.8.0",
  "type": "module",
~~~~~

#### Acts 2: 提交代码

~~~~~act
git_add
package.json
src/storage/indexed-db-adapter.js
src/storage/local-storage.adapter.js
src/ui/templates.js
src/ui/dom.js
src/ui/state.js
src/ui/events.js
src/ui/index.js
src/main.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat(ui): implement rehydratable page-based memory cache

Introduces a zero-latency rendering path for UI pauses and navigation. 

Key changes:
- Implemented `ViewCache` class in UI controller, utilizing a page-based LRU eviction strategy.
- Integrated cache rehydration in `main.js`: live-captured messages are now synchronously injected into the memory cache while being persisted to IndexedDB.
- Added a new configuration option `cachePages` (default 5) in the settings panel to allow users to tune memory usage.
- Refactored `refreshView` to prioritize cache lookups, effectively eliminating database overhead and UI flickering when unpausing or scrolling through recent history.
- Added cache invalidation triggers during heavy background data merges to ensure strict data consistency.

Version bumped to 7.8.0.
~~~~~

### 下一步建议
- **性能观察**: 在低内存设备（如旧款安卓手机）上观察大页码（如每页 2000 条）时的缓存表现。
- **预加载策略**: 未来可以考虑实现“预加载相邻页”的逻辑，使翻页体验也达到瞬时响应。
