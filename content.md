## [COMMIT] fix(ui): 修复初始服务器状态同步并精细化状态显示

### 用户需求提交涵盖了核心逻辑修复（解决启动时的时序竞争问题）和用户体验改进（细化加载阶段
将当前的修复（初始化状态丢失）和 UI 改进（区分“已检测”与“正在记录”）提交的反馈），使整个应用的启动过程在感知上更加灵敏和准确。

### 目标
1. 将 `src/main.js` 和 `src/ui/renderer.js` 的更改添加到暂存区。
2. 创建一个清晰、规范的 Git 提交记录。

### 基本原理
遵循 `[COMMIT]` 计划规范，本计划仅包含 Git 相关操作。我们通过详细的提交说明（Commit Message）记录本次修复的技术细节。

### 标签
#intent/fix #intent/tune #flow/ready #priority/medium #comp/ui #comp/runtime #scope/ux #ai/instruct #task/domain/ui #task/object/server-status #task/action/fix-and-refine #task/state/end

---

### Script

#### Acts 1: 提交变更

我们将修改后的文件添加到 Git 暂存区，并创建一个包含 Bug 修复描述和 UX 改进说明的提交。

~~~~~act
git_add
src/main.js
src/ui/renderer.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
fix(ui): sync initial server state and refine status messaging

- Fixes a race condition in main.js where the server name detected before createUI() was finished would be lost to the UI until the next DOM mutation.
- Refines the server status display in renderer.js to distinguish between "Detected" (server found on the login screen) and "Recording" (actually in-game with an active chat channel).
- Improves the loading experience by providing immediate feedback as soon as the "Play on..." button is detected.
~~~~~

### 下一步建议
- **测试验证**: 建议在不同网络速度或设备上观察加载界面的提示变化，确保“已检测到”状态能如期出现。
- **UI 润色**: 既然现在能够区分加载状态，未来可以考虑在“已检测到”状态下增加一个加载动画，进一步增强视觉反馈。
