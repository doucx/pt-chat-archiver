在 JavaScript 生态中，最接近 Python **Ruff** 的工具是 **Biome**。

### 核心推荐：Biome

**Biome** (前身是 Rome) 的设计理念与 Ruff 非常相似：
1.  **极速**: 使用 Rust 编写，速度极快。
2.  **全能**: 它是一个“单二合一”工具，同时处理 **Linting (静态检查)** 和 **Formatting (代码格式化)**，不需要像传统 JS 项目那样安装 ESLint + Prettier 的复杂组合。
3.  **零配置/易配置**: 默认规则非常平衡，配置文件简洁。

此外，传统的行业标准方案是 **ESLint** (检查逻辑错误) + **Prettier** (强制统一格式)，但它们配置较重且运行较慢。考虑到你追求类似 Ruff 的体验，我建议为项目集成 Biome。

---

## [WIP] feat: 集成 Biome 作为项目的代码质量检查与格式化工具

### 用户需求

用户希望为 JS 项目引入类似 Python Ruff 的静态检查和格式化工具，以提升代码质量和开发效率。

### 评论

对于这种小而精的 Userscript 项目，Biome 是完美的选择。它不需要安装几十个插件（像 ESLint 那样），也不需要处理 Linter 和 Formatter 之间的冲突，且运行速度几乎是瞬时的。

### 目标

1.  在项目中安装 `biome`。
2.  初始化 `biome.json` 配置文件。
3.  在 `package.json` 中添加相应的脚本，以便通过 `npm run lint` 和 `npm run format` 进行操作。

### 基本原理

我们将利用 `npm` 安装 Biome 核心包。通过 `biome.json` 我们可以一站式配置代码风格（如使用单引号、不使用分号等）和检查规则。这不仅能统一项目的代码风格，还能在构建前发现潜在的 Bug。

### 标签

#intent/tooling #flow/ready #priority/medium #comp/build #scope/dx #ai/instruct #task/domain/tooling #task/object/biome-integration #task/action/setup #task/state/continue

---

### Script

#### Acts 1: 安装 Biome 并配置项目脚本

我们首先修改 `package.json`，添加 `devDependencies` 和运行脚本。

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
  "scripts": {
    "dev": "vite",
    "watch": "vite build --watch",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^7.3.1",
    "vite-plugin-monkey": "^7.1.9"
  }
}
~~~~~
~~~~~json.new
  "scripts": {
    "dev": "vite",
    "watch": "vite build --watch",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "biome lint .",
    "format": "biome format . --write",
    "check": "biome check --apply ."
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "vite": "^7.3.1",
    "vite-plugin-monkey": "^7.1.9"
  }
}
~~~~~

#### Acts 2: 初始化 Biome 配置文件

我们将创建一个基础的 `biome.json`。我根据一般 JS 习惯配置了单引号和分号规则。

~~~~~act
write_file
biome.json
~~~~~
~~~~~json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineEnding": "lf",
    "lineWidth": 100,
    "attributePosition": "auto"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semiColons": "always"
    }
  }
}
~~~~~

### 下一步建议

1.  **运行检查**: 执行 `npm run check`。这会同时进行代码检查、导入优化和自动修复一些简单的格式问题。
2.  **编辑器支持**: 如果你使用 VS Code，建议搜索并安装 **Biome** 扩展，它可以实现“保存时自动格式化”，体验非常接近 Python 中配置了 Ruff 的环境。
3.  **处理警告**: Biome 可能会对现有代码中的一些潜在问题（如未定义的全局变量、console 调用等）发出警告，你可以根据提示进行微调。
