好的，为项目集成测试覆盖率报告是一个非常明智的决定。它能直观地告诉我们哪些逻辑路径还没有被测试覆盖到，从而指导我们编写更有针对性的测试。

我们将使用 Vitest 推荐的 **`@vitest/coverage-v8`** 插件。

## [WIP] feat(testing): 集成 Vitest 覆盖率报告功能

### 用户需求
在现有的测试套件中添加代码覆盖率统计功能，以便评估测试的全面性。

### 评论
覆盖率报告不仅是质量的度量工具，也是开发者的导航图。通过 HTML 报告，我们可以精确地看到 `parser.js` 或 `analysis.js` 中哪些复杂的 `if/else` 分支从未被执行过。

### 目标
1.  在 `package.json` 中添加覆盖率相关的开发依赖和运行脚本。
2.  在 `vite.config.js` 中配置覆盖率选项，包括报告格式和包含/排除的文件范围。

### 基本原理
Vitest 能够利用 Node.js 原生的 V8 覆盖率采集能力。通过配置 `coverage` 选项，我们可以让 Vitest 在运行测试后自动生成报告。我们将配置生成 `text`（控制台预览）和 `html`（浏览器详细查看）两种格式的报告。

### 标签
#intent/tooling #flow/ready #priority/medium #comp/build #comp/tests #scope/dx #ai/instruct #task/domain/testing #task/object/coverage-integration #task/action/configuration #task/state/continue

---

### Script

#### Acts 1: 更新配置文件以支持覆盖率报告

我们将修改 `package.json` 以引入依赖并添加脚本，同时在 `vite.config.js` 中定义覆盖率的行为。

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
    "test": "vitest",
    "lint": "biome lint .",
~~~~~
~~~~~json.new
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "biome lint .",
~~~~~

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
    "vite-plugin-monkey": "^7.1.9",
    "vitest": "^3.0.5"
  }
~~~~~
~~~~~json.new
    "vite-plugin-monkey": "^7.1.9",
    "@vitest/coverage-v8": "^3.0.5",
    "vitest": "^3.0.5"
  }
~~~~~

~~~~~act
patch_file
vite.config.js
~~~~~
~~~~~javascript.old
  test: {
    environment: 'jsdom',
    globals: true,
  },
~~~~~
~~~~~javascript.new
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/main.js'], // main.js 包含大量 DOM 监听器，单元测试覆盖成本较高
    },
  },
~~~~~

### 下一步建议

1.  **安装依赖**: 请运行 `npm install`。
2.  **生成报告**: 运行 `npm run test:coverage`。
    *   你将在终端看到一个表格形式的汇总报告。
    *   项目根目录下会生成一个 `coverage/` 文件夹。你可以用浏览器打开 `coverage/index.html`，通过交互界面查看每一行代码的覆盖情况。
3.  **针对性增强**: 根据报告结果，针对那些覆盖率较低的模块（通常是 `renderer.js` 或复杂的 `analysis.js` 逻辑）补充测试用例。
4.  **COMMIT 建议**: 现在可以执行一次完整的 Git 提交，将整个测试框架（环境、用例、覆盖率）永久合入项目。如果你需要我生成提交计划，请告诉我。
