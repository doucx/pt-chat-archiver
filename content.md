这是一个非常标准且优雅的需求。在 Vite 生态中，我们可以利用 `package.json` 作为事实来源，并通过 Vite 的 `define` 配置在构建时将版本号注入到代码中。同时，`vite-plugin-monkey` 可以直接引用这个变量来同步油猴脚本的元数据。

我将生成一个计划来实现这一 SSOT（单点真理）架构。

## [WIP] refactor: 实现版本号 SSOT 机制

### 用户需求
将项目版本号统一在 `package.json` 中管理，并确保 `vite.config.js` (油猴元数据) 和 `src/ui.js` (界面显示) 在构建时能够自动获取该版本号，消除硬编码。

### 评论
这是一个良好的工程实践。通过 Vite 的 `define` 功能，我们可以将 node 环境中的变量“硬编码”到浏览器端的代码中，这既保证了运行时的性能，又维持了开发时的灵活性。

### 目标
1.  将 `package.json` 的 `version` 更新为 `5.5.0`。
2.  修改 `vite.config.js` 以导入 `package.json`，并配置 `define` 选项。
3.  同步 `vite-plugin-monkey` 的 `version` 配置。
4.  在 `src/ui.js` 中使用注入的全局常量 `__APP_VERSION__`。

### 基本原理
1.  **注入**: 在 `vite.config.js` 中定义 `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`。Vite 在打包时会扫描源代码，将所有的 `__APP_VERSION__` 标识符替换为字符串字面量 `"5.5.0"`。
2.  **元数据同步**: 直接将从 `package.json` 读取的变量传递给 `monkey()` 插件的配置对象。

### 标签
#intent/refine #flow/ready #priority/medium #comp/build #comp/ui #concept/config #scope/dx #ai/instruct #task/domain/build-system #task/object/version-ssot #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 更新 `package.json` 版本号

首先，我们将 `package.json` 中的版本号更新为目标版本。

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
  "name": "pt-chat-archiver",
  "private": true,
  "version": "0.0.0",
  "type": "module",
~~~~~
~~~~~json.new
  "name": "pt-chat-archiver",
  "private": true,
  "version": "5.5.0",
  "type": "module",
~~~~~

#### Acts 2: 配置 `vite.config.js` 进行注入与同步

修改 Vite 配置，引入 `package.json` 并设置 `define` 常量，同时更新插件配置。

~~~~~act
patch_file
vite.config.js
~~~~~
~~~~~javascript.old
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'PonyTown Chat Archiver',
        namespace: 'http://tampermonkey.net/',
        version: '5.5.0',
        description: '自动将 pony.town 的聊天记录保存到浏览器本地存储，并提供查看、复制、下载、数据统计和清除界面。',
~~~~~
~~~~~javascript.new
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import pkg from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'PonyTown Chat Archiver',
        namespace: 'http://tampermonkey.net/',
        version: pkg.version,
        description: '自动将 pony.town 的聊天记录保存到浏览器本地存储，并提供查看、复制、下载、数据统计和清除界面。',
~~~~~

#### Acts 3: 在 `src/ui.js` 中使用注入的版本常量

将 UI 标题中的硬编码字符串替换为 `__APP_VERSION__`。在构建时，它会被自动替换。

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
- **执行构建验证**: 建议运行 `npm run build`，然后检查生成的 `dist/ponytown-chat-archiver.user.js` 文件。
    - 检查开头的 `// @version` 是否为 `5.5.0`。
    - 检查代码中渲染 UI 的部分，`v5.5.0` 是否已被正确填入。
- **环境适配**: 这里的 `__APP_VERSION__` 是一个全局常量。如果你使用了 ESLint，可能需要将其加入 `globals` 配置中以避免未定义变量的警告。
