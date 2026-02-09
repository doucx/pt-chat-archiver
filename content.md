你的想法完全正确，这正是工程上的最佳实践。将版本号集中在 `package.json` 中作为单一事实源 (SSOT)，然后通过构建工具在不同环境（构建配置和客户端代码）中使用它，可以确保版本号的一致性，并简化发布流程。

Vite 的 `define` 配置项就是为此类需求设计的。它可以在构建时将一个值作为全局常量注入到你的客户端代码中。

我将为你生成一个计划来实现这个重构。

## [WIP] refactor: 将版本号统一至 package.json 作为单一事实源 (SSOT)

### 用户需求

用户希望将项目版本号 `5.5.0` 统一管理在 `package.json` 文件中，并让 `vite.config.js` 和 `src/ui.js` 两个文件都从这个单一来源消费该版本号，消除硬编码。

### 评论

这是一个非常标准的最佳实践。将版本号等元数据集中在 `package.json` 中，可以确保版本号在用户脚本元信息和 UI 显示之间保持同步，极大地提高了项目的可维护性，并降低了手动更新多处版本号时出错的风险。

### 目标

1.  在 `package.json` 中添加 `version` 字段。
2.  修改 `vite.config.js`，使其从 `package.json` 读取版本号用于 `userscript` 配置。
3.  在 `vite.config.js` 中使用 `define` 选项，将版本号作为一个全局常量注入到客户端代码中。
4.  修改 `src/ui.js`，使用这个被注入的全局常量来显示版本号，而不是硬编码。

### 基本原理

核心在于利用 Vite 的 `define` 配置项。我们首先将 `package.json` 作为常规的 JSON 模块导入到 `vite.config.js`（这是一个 Node.js 环境，所以可以直接读取文件）。然后，我们定义一个全局常量，例如 `__APP_VERSION__`，并将其值设置为从 `package.json` 中读取的版本号字符串。

Vite 在构建时会执行全局文本替换，将代码中所有的 `__APP_VERSION__` 替换为其实际值（例如 `"5.5.0"`）。这样，客户端代码 `src/ui.js` 就能像使用一个普通的 JavaScript 变量一样使用它，而无需知道它的值是在构建时被注入的。

### 标签

#intent/refine #flow/ready #priority/medium #comp/build #scope/dx #ai/instruct #task/domain/tooling #task/object/versioning #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 将版本号写入 `package.json`

首先，我们在 `package.json` 中正式定义版本号。

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
{
  "name": "pt-chat-archiver",
  "private": true,
  "version": "0.0.0",
  "type": "module",
~~~~~
~~~~~json.new
{
  "name": "pt-chat-archiver",
  "private": true,
  "version": "5.5.0",
  "type": "module",
~~~~~

#### Acts 2: 更新构建配置以使用和注入版本号

接下来，我们修改 `vite.config.js`。它将导入 `package.json` 来获取版本号，一方面用于 userscript 的头部信息，另一方面通过 `define` 注入到前端代码中。

~~~~~act
write_file
vite.config.js
~~~~~
~~~~~javascript
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import packageJson from './package.json';

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'PonyTown Chat Archiver',
        namespace: 'http://tampermonkey.net/',
        version: packageJson.version,
        description: '自动将 pony.town 的聊天记录保存到浏览器本地存储，并提供查看、复制、下载、数据统计和清除界面。',
        author: 'doucx',
        match: [
          'https://pony.town/*',
          'https://*.pony.town/*'
        ],
        grant: ['GM_addStyle'],
        license: 'MIT',
        'run-at': 'document-idle',
      },
      build: {
        fileName: 'ponytown-chat-archiver.user.js',
      },
    }),
  ],
});
~~~~~

#### Acts 3: 更新 UI 代码以消费注入的版本号

最后，我们修改 `src/ui.js`，让它使用我们新注入的 `__APP_VERSION__` 全局常量。

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
    container.id = 'log-archive-ui-container';
    container.innerHTML = `
            <div id="log-archive-ui-header">
                <h2>聊天记录存档 v5.5.0</h2>
                <div id="log-archive-ui-controls">
                    <input type="text" id="log-archive-self-name-input" placeholder="输入你的昵称...">
~~~~~
~~~~~javascript.new
    container.id = 'log-archive-ui-container';
    container.innerHTML = `
            <div id="log-archive-ui-header">
                <h2>聊天记录存档 v${__APP_VERSION__}</h2>
                <div id="log-archive-ui-controls">
                    <input type="text" id="log-archive-self-name-input" placeholder="输入你的昵称...">
~~~~~

### 下一步建议

1.  **执行构建**: 运行 `npm run build` 或你配置的构建命令。
2.  **验证结果**:
    *   检查生成的 `ponytown-chat-archiver.user.js` 文件，确认其头部的 `@version` 是否是 `5.5.0`。
    *   在生成的代码中搜索，确认 `聊天记录存档 v5.5.0` 已经被替换为 `聊天记录存档 v${__APP_VERSION__}` 的编译后结果，即 `聊天记录存档 v"5.5.0"` 或类似内容。
    *   在浏览器中安装并运行新脚本，确认 UI 界面上显示的版本号是正确的。

这样，未来你只需要更新 `package.json` 中的版本号，整个项目的版本信息就会自动同步。
