好的，初始化挂起以及首次进场频道显示缺失的问题已经全部修复。现在我们将这些改进作为一个完整的逻辑单元进行提交。

## [COMMIT] fix: 修复初始化状态卡死及首次进场频道显示缺失

### 用户需求
确保 UI 能够准确、即时地反映记录状态，特别是在重新进入同一个服务器或脚本首次激活的瞬间，不应出现状态滞后或信息缺失。

### 评论
这些细节修复显著提升了工具的响应性。通过分离 DOM 轮询状态与持久化状态，并强制在记录器激活时进行状态同步，我们消除了逻辑盲区，使 UI 表现更符合用户直觉。

### 目标
1. 提交 `main.js` 中关于状态同步和变量分离的修复。
2. 提交 `ui/state.js` 和 `ui/renderer.js` 中关于“上一个服务器”提示的 UI 增强。

### 基本原理
我们在 `main.js` 中引入了 `currentDOMServer` 来处理轮询去重，这使得 `detectedServerName` 可以独立承担“逻辑回退值”的角色，从而解决了同服进入时的 `if` 逻辑死锁。同时，在 `activateLogger` 激活的瞬间主动调用 `updateRecordingStatus`，确保了频道后缀（如 `::Local`）能够第一时间渲染。

### 标签
#intent/fix #intent/tune #flow/ready #priority/high #comp/engine #comp/ui #scope/ux #ai/instruct #task/domain/ui #task/object/initialization-sync #task/action/robustness-fix #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交状态同步与 UI 增强变更

我们将修改后的逻辑文件添加到 Git 暂存区并提交。

~~~~~act
git_add
src/main.js
src/ui/state.js
src/ui/renderer.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
fix(ui): resolve initialization hang and missing channel suffix

- Decoupled DOM polling state from persisted server state in `main.js` to fix a bug where re-entering the same server would not trigger UI updates.
- Added a "Last Server" hint in the UI during the "Waiting for game" state for better feedback.
- Forced a UI status update immediately upon `activateLogger` to ensure the channel suffix (e.g., '::Local') is displayed correctly on the first entry.
- Synced `lastServer` state in `UIState` to keep the waiting-state information accurate.
~~~~~

### 下一步建议
- **多场景测试**：建议在网络较差或频繁重连的情况下观察 UI 提示的稳定性。
- **UI 细节优化**：如果觉得“上一个服务器”的括号显示太长，可以考虑将其缩减为较小的图标提示。
- **文档更新**：在 README 中提及这一健壮性改进，告知用户脚本现在具备更强的状态恢复能力。
