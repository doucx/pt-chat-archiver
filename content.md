好的。为了在当前的 Vite 项目中建立测试套件，我建议使用 **Vitest**。它与 Vite 原生集成，速度极快，且 API 与 Jest 兼容，非常适合现代 JavaScript 项目。同时，由于你的项目涉及大量的 DOM 操作，我们需要配置 **jsdom** 环境。

我将为你配置环境，并添加一个针对 `utils.js` 中日期格式化功能的测试用例作为示例。

## [WIP] feat(testing): 初始化基于 Vitest 和 JSDOM 的测试环境

### 用户需求
为项目配置测试基础设施，并添加基础测试用例以验证环境可用性。

### 评论
引入自动化测试是项目迈向稳健性的关键一步。Vitest 能够直接复用 `vite.config.js` 的配置（包括你定义的 `__APP_VERSION__`），这能有效避免测试环境与生产环境的行为差异。

### 目标
1.  更新 `package.json`，添加 `vitest` 和 `jsdom` 依赖，并增加 `test` 脚本。
2.  配置 `vite.config.js` 以支持 Vitest 测试环境。
3.  创建 `tests/` 目录并编写 `utils.test.js`。

### 基本原理
通过在 `package.json` 中添加开发依赖并配置 `test` 脚本，开发者可以使用 `npm test` 启动测试。通过配置 `jsdom` 环境，我们可以在 Node.js 中模拟浏览器 API（如 `localStorage` 和 `DOM`），这对于测试你的存储和 UI 逻辑至关重要。

### 标签
#intent/tooling #flow/ready #priority/high #comp/build #comp/tests #scope/dx #ai/instruct #task/domain/testing #task/object/test-suite #task/action/configuration #task/state/begin

---

### Script

#### Acts 1: 更新项目配置文件

我们将修改 `package.json` 以引入必要的测试库，并调整 `vite.config.js`。

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
    "build": "vite build",
    "preview": "vite preview",
    "lint": "biome lint .",
~~~~~
~~~~~json.new
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "lint": "biome lint .",
~~~~~

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "vite": "^7.3.1",
    "vite-plugin-monkey": "^7.1.9"
  }
~~~~~
~~~~~json.new
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "jsdom": "^26.0.0",
    "vite": "^7.3.1",
    "vite-plugin-monkey": "^7.1.9",
    "vitest": "^3.0.5"
  }
~~~~~

~~~~~act
patch_file
vite.config.js
~~~~~
~~~~~javascript.old
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
~~~~~
~~~~~javascript.new
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
  plugins: [
~~~~~

#### Acts 2: 创建测试目录和首个测试用例

我们将创建一个基础的单元测试，验证 `utils.js` 中的日期处理逻辑是否符合预期。

~~~~~act
run_command
~~~~~
~~~~~
mkdir -p tests
~~~~~

~~~~~act
write_file
tests/utils.test.js
~~~~~
~~~~~javascript
import { describe, it, expect } from 'vitest';
import { formatISOTimeForDisplay } from '../src/utils.js';

describe('Utils: formatISOTimeForDisplay', () => {
  it('应当正确格式化标准的 ISO 字符串', () => {
    const isoString = '2023-10-27T10:30:00.000Z';
    // 注意：格式化结果取决于运行测试的环境时区。
    // 这里我们检查基本的格式结构
    const result = formatISOTimeForDisplay(isoString);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('当输入为空或 undefined 时应当返回 N/A', () => {
    expect(formatISOTimeForDisplay(null)).toBe('N/A');
    expect(formatISOTimeForDisplay(undefined)).toBe('N/A');
    expect(formatISOTimeForDisplay('')).toBe('N/A');
  });

  it('当输入非法日期字符串时应当返回 "日期无效"', () => {
    expect(formatISOTimeForDisplay('not-a-date')).toBe('日期无效');
  });
});
~~~~~

### 下一步建议

1.  **安装依赖**: 请运行 `npm install` 以安装新添加的测试工具。
2.  **运行测试**: 执行 `npm test` 查看测试结果。
3.  **扩展测试**:
    *   **Storage 测试**: 编写针对 `src/storage.js` 的测试，验证 `localStorage` 的读取和写入。由于我们配置了 `jsdom`，`vitest` 能够直接访问模拟的 `localStorage`。
    *   **Parser 测试**: 编写针对 `src/parser.js` 的测试，可以通过 `document.createElement` 构造 DOM 节点，验证解析引擎是否能正确提取消息。
    *   **UI 状态测试**: 验证 `src/ui/state.js` 中的分页和视图切换逻辑。
