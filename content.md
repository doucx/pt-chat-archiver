好的，既然构建流已经跑通并验证成功，我们现在将这些改动作为一个正式的逻辑单元提交到 Git 仓库。

## [COMMIT] feat: 初始化 Vite + Monkey 构建系统并迁移原始脚本

### 用户需求
将项目的基础设施建设完成，包括构建配置、开发环境调整以及代码的初步迁移，并建立首个 Git 提交记录。

### 评论
通过将脚本迁移到 Vite 体系并解决 CSP 导致的开发阻碍，我们已经为后续的大规模重构和拆分打下了坚实的基础。这是一个重要的里程碑，标志着项目从“单文件野蛮生长”转向了“模块化正规开发”。

### 目标
1.  将所有环境配置文件和源代码添加到 Git 暂存区。
2.  创建一个包含详细变更说明的初始提交。

### 基本原理
遵循 `[COMMIT]` 规范，本阶段仅包含 Git 操作，以确保文件系统变更已通过验证并被持久化记录。

### 标签
#intent/build #flow/ready #priority/high #comp/build #scope/dx #ai/instruct #task/domain/build-system #task/object/initial-setup #task/action/commit #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交变更

我们将当前所有有效的配置和源码文件进行提交。

~~~~~act
git_add
package.json
vite.config.js
src/main.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
feat: initialize Vite + Monkey build system

- Setup Vite with `vite-plugin-monkey` for userscript development.
- Migrate `old_script.js` to `src/main.js` and managed metadata via `vite.config.js`.
- Cleanup Vite vanilla boilerplate files.
- Add `watch` script to package.json to bypass PonyTown's strict CSP via local file requirement.
- Successfully verified build output and local development workflow.
~~~~~

### 下一步建议
- **模块化拆分**: 现在的 `src/main.js` 依然是一个巨大的文件。我们可以开始将其中的“数据清理逻辑”、“UI 创建逻辑”和“DOM 解析逻辑”分别提取到不同的 `.js` 文件中。
- **引入 CSS 模块**: 考虑将 `main.js` 中 `GM_addStyle` 的 CSS 提取到 `src/style.css`，直接在 JS 中使用 `import './style.css'`，Vite 会自动帮我们处理注入。

**如果你准备好了，请告诉我，我们将开始提取第一个模块：`parser.js`（解析引擎）。**
