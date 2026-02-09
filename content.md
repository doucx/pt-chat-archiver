你的分析非常准确。在现代前端开发中，将版本号通过 `package.json` 进行统一管理（SSOT）是最佳实践。这不仅能确保构建出的 Userscript 元信息正确，也能让 UI 界面实时反映当前版本。

我将执行以下步骤：
1.  更新 `package.json` 中的 `version` 字段为 `5.5.0`。
2.  在 `src/constants.js` 中新增 `VERSION` 常量。
3.  修改 `vite.config.js`，使其动态读取 `package.json` 中的版本号。
4.  修改 `src/ui.js`，通过导入 `VERSION` 常量来渲染标题。

## [WIP] refactor: 建立项目版本号的单事实来源 (SSOT)

### 用户需求
消除项目中硬编码的版本号，建立以 `package.json` 为核心、`src/constants.js` 为中转的版本号管理体系。

### 评论
这是一个基础但关键的重构。随着项目的迭代，手动在多个文件（构建配置、源码、UI）中维护版本号极易出错。通过 SSOT，我们只需要在一个地方（`package.json`）修改版本，整个系统就会自动同步。

### 目标
1.  同步 `package.json` 版本号。
2.  在 `constants.js` 中定义版本号常量。
3.  打通 `vite.config.js` 与 `package.json` 的版本关联。
4.  实现 `src/ui.js` 的版本号动态渲染。

### 基本原理
利用 Vite 对 JSON 文件的原生支持，在 `vite.config.js` 中通过 `import` 读取 `package.json`。而在运行时代码中，我们将版本号定义在 `constants.js` 中。虽然最完美的 SSOT 是运行时也直接 `import package.json`，但考虑到 Userscript 的打包体积和某些环境下的兼容性，在 `constants.js` 中手动维护一个与 `package.json` 同步的变量是性能与维护性的折中方案。

### 标签
#intent/refine #flow/ready #priority/medium #comp/build #comp/ui #scope/dx #ai/instruct #task/domain/devops #task/object/versioning-ssot #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 更新 `package.json` 和 `constants.js`

首先将底层数据源同步到目标版本。

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

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
// 全局配置与状态
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
~~~~~
~~~~~javascript.new
// 全局配置与状态
export const VERSION = '5.5.0';
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
~~~~~

#### Acts 2: 修改 `vite.config.js` 引用 `package.json`

让 Userscript 的元数据（Meta Block）自动跟随 `package.json`。

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
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'PonyTown Chat Archiver',
        namespace: 'http://tampermonkey.net/',
        version: pkg.version,
        description: '自动将 pony.town 的聊天记录保存到浏览器本地存储，并提供查看、复制、下载、数据统计和清除界面。',
~~~~~

#### Acts 3: 修改 `src/ui.js` 渲染动态版本号

最后，让 UI 界面引用我们在 `constants.js` 中定义的版本。

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
import { SELF_NAME_KEY, STORAGE_KEY_V5 } from './constants.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from './utils.js';
~~~~~
~~~~~javascript.new
import { SELF_NAME_KEY, STORAGE_KEY_V5, VERSION } from './constants.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from './utils.js';
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
    container.innerHTML = `
            <div id="log-archive-ui-header">
                <h2>聊天记录存档 v5.5.0</h2>
                <div id="log-archive-ui-controls">
~~~~~
~~~~~javascript.new
    container.innerHTML = `
            <div id="log-archive-ui-header">
                <h2>聊天记录存档 v${VERSION}</h2>
                <div id="log-archive-ui-controls">
~~~~~

### 下一步建议
- **执行验证**: 运行 `npm run build`，检查生成的 `.user.js` 文件头部的 `// @version` 是否正确变为 `5.5.0`。
- **UI 检查**: 在浏览器中打开插件界面，确认标题显示为 `聊天记录存档 v5.5.0`。
- **自动同步脚本 (进阶)**: 如果希望更彻底的 SSOT，可以考虑在 `vite.config.js` 中使用 `define` 插件将 `pkg.version` 注入为全局常量 `__APP_VERSION__`，从而连 `src/constants.js` 中的硬编码也可以去掉。如果你有兴趣，我们可以进一步实施。
