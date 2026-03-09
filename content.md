好的，既然你已经确认了方案，我们现在将这些改动作为一个完整的逻辑单元提交到 Git 仓库中。

## [COMMIT] feat: 增加动态初始化防抖延迟设置与短路拦截保护

### 用户需求
将“初始化防抖延迟”改为用户可配置项，并实现基于历史消息数量的短路机制，以解决手机端与电脑端性能差异导致的记录遗漏问题。

### 评论
这个提交标志着系统初始化鲁棒性的一次重要提升。通过允许用户根据设备性能微调核心参数，我们增强了脚本在不同运行环境下的适应能力。

### 目标
1. 将所有涉及 UI 设置、持久化配置和核心监听逻辑的改动添加到 Git 暂存区。
2. 创建一个详细说明改动动机（解决移动端加载延迟）和实现逻辑（防抖配置 + 断路器）的提交。

### 基本原理
遵循 `[COMMIT]` 规范，我们将刚才在多个文件中完成的相互关联的修改一起提交。这保证了版本历史的清晰性，即一个 Feature 对应一个逻辑提交。

### 标签
#intent/build #flow/ready #priority/high #comp/runtime #comp/ui #concept/config #scope/ux #ai/instruct #task/domain/core #task/object/initialization #task/action/refactor #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交变更

我们将所有相关文件添加到暂存区并提交。

~~~~~act
git_add
src/ui/templates.js
src/ui/dom.js
src/storage/indexed-db-adapter.js
src/storage/local-storage.adapter.js
src/ui/state.js
src/ui/events.js
src/ui/index.js
src/main.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat: add dynamic initialization debounce and short-circuit protection

- Introduced 'initDebounceMs' in UI configuration and persistent storage (default 150ms).
- Replaced hard-coded debounce in 'activateLogger' with dynamic user setting to accommodate mobile performance differences.
- Implemented a short-circuit mechanism (MAX_HISTORY_NODES) in MutationObserver to prevent infinite initialization loops when long debounce times are used in active channels.
- Added UI inputs and event bindings for the new setting.

This fix addresses an issue where mobile devices, due to slower DOM rendering, would prematurely finish the initialization phase, causing historical messages to be misprocessed.
~~~~~

### 下一步建议
- **设备验证**: 在手机端打开设置界面，将“初始化防抖延迟”设置为 1500ms，观察重新进入游戏时历史记录是否能被完整且正确地识别。
- **UI 优化**: 如果将来配置项增多，可以考虑将设置界面划分为“常规”和“高级/调试”两个子区域，将防抖延迟放入高级选项中。
