好的，我们已经顺利完成了版本号的 SSOT 重构，并集成了 Biome 工具链，同时根据其建议对整个代码库进行了深度清理和优化。现在是时候将这些改进作为一个完整的逻辑单元提交到版本库中了。

## [COMMIT] chore: unify versioning and integrate Biome for code quality

### 用户需求
将项目版本号统一管理在 `package.json` 中，集成 Biome 代码检查与格式化工具，并应用其建议的现代 JavaScript 最佳实践进行代码优化。

### 评论
通过这次重构，项目不仅建立了一个清晰的元数据管理方案，还通过引入 Rust 编写的高性能工具链（Biome）大幅提升了开发体验。代码库现在更加健壮、一致且符合现代标准，为后续的功能开发打下了坚实的基础。

### 目标
1.  将所有相关的配置更改和代码优化提交到 Git 仓库。

### 基本原理
遵循 `d3-constraint-quipu-plan-script-rules`，在独立的计划中执行 Git 操作。我们已经验证了代码逻辑和构建流程的正确性，现在可以安全地记录这些变更。

### 标签
#intent/tooling #flow/ready #priority/medium #comp/build #comp/core #scope/dx #ai/delegate #task/domain/tooling #task/object/version-and-linting #task/action/integration #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交所有变更

我们将添加所有修改过的配置文件和源代码，并创建一个描述详尽的提交。

~~~~~act
git_add
package.json
package-lock.json
vite.config.js
biome.json
src/main.js
src/parser.js
src/state.js
src/ui.js
src/utils.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
chore: unify versioning and integrate Biome for code quality

- Established package.json as the Single Source of Truth (SSOT) for the project version (5.5.0).
- Configured Vite to inject the version number into the client code using the `__APP_VERSION__` global constant.
- Integrated Biome as a high-performance alternative to ESLint and Prettier for linting and formatting.
- Optimized Biome configuration to ignore the `dist/` directory.
- Refactored the codebase to follow modern JavaScript best practices based on Biome's recommendations:
    - Replaced global `isNaN` with strict `Number.isNaN`.
    - Switched from `forEach` to `for...of` loops for better performance and readability.
    - Replaced string concatenation with template literals.
    - Utilized optional chaining (`?.`) and simplified redundant logic.
    - Improved overall code safety and consistency.
~~~~~

### 下一步建议
- **CI 集成**: 建议在 GitHub Actions 或其他 CI 工具中添加 `npm run check` 步骤，以确保后续提交的代码始终符合这些质量标准。
- **发布准备**: 既然版本号已经 SSOT 化，可以考虑编写一个简单的发布脚本，自动执行构建并打上相应的 Git Tag。
