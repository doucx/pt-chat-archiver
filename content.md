你的需求非常明确：我们要把 Vite 的样板代码清理掉，并将 `old_script.js` 转换为 Vite + Monkey 的开发模式。

最核心的变化是：**油猴元数据（Header）将从代码中移出，交给 `vite.config.js` 管理**。Vite 在构建时会自动生成这一部分。

---

## [WIP] chore: 初始化项目结构并将原始脚本迁移至 Vite 构建流

### 用户需求
清理 Vite 默认模板的冗余文件，配置 `vite-plugin-monkey`，并将 `old_script.js` 迁移为项目的入口文件 `src/main.js`，确保构建流程能够生成功能一致的单文件脚本。

### 评论
这是一个标准的“工程化”第一步。通过 `vite-plugin-monkey` 管理元数据，我们可以利用 Vite 的热更新（HMR）特性进行开发，同时保持发布时的兼容性。

### 目标
1.  创建并配置 `vite.config.js`，包含原始脚本的所有元数据。
2.  删除 Vite 模板自带的无用文件（`counter.js`, `style.css` 等）。
3.  将 `old_script.js` 覆盖到 `src/main.js`。
4.  从 `src/main.js` 中移除硬编码的 `==UserScript==` 块，改由配置文件生成。

### 基本原理
`vite-plugin-monkey` 会读取配置文件中的 `userscript` 对象，并在构建输出的 `.user.js` 文件顶部自动插入正确的 Header。因此，源代码中不再需要保留那段注释块，这有助于保持代码纯粹。

### 标签
#intent/tooling #flow/ready #priority/high #comp/build #comp/cli #concept/config #scope/dx #ai/instruct #task/domain/build-system #task/object/vite-monkey-setup #task/action/initialization #task/state/begin

---

### Script

#### Acts 1: 创建 Vite 配置文件

这是项目的核心配置。我根据你 `old_script.js` 中的 Header 信息提取了元数据。

~~~~~act
write_file
vite.config.js
~~~~~
~~~~~javascript
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

#### Acts 2: 清理模板冗余文件

我们将删除 Vite 默认生成的、与油猴脚本无关的文件。

~~~~~act
run_command
~~~~~
~~~~~bash
rm src/counter.js src/javascript.svg src/style.css index.html
~~~~~

#### Acts 3: 迁移原始代码并清理 Header

我们将 `old_script.js` 移动到 `src/main.js`，然后使用 `patch_file` 删掉代码中已经不再需要的元数据注释块。

~~~~~act
move_file
src/old_script.js
src/main.js
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
// ==UserScript==
// @name          PonyTown 网页聊天记录存档器
// @namespace     http://tampermonkey.net/
// @version       5.5.0
// @description   自动将 pony.town 的聊天记录保存到浏览器本地存储，并提供查看、复制、下载、数据统计和清除界面。支持结构化数据提取和Emoji格式化。
// @author        doucx
// @match         https://pony.town/*
// @match         https://*.pony.town/*
// @grant         GM_addStyle
// @run-at        document-idle
// @license       MIT
// @downloadURL https://update.greasyfork.org/scripts/543647/PonyTown%20%E7%BD%91%E9%A1%B5%E8%81%8A%E5%A4%A9%E8%AE%B0%E5%BD%95%E5%AD%98%E6%A1%A3%E5%99%A8.user.js
// @updateURL https://update.greasyfork.org/scripts/543647/PonyTown%20%E7%BD%91%E9%A1%B5%E8%81%8A%E5%A4%A9%E8%AE%B0%E5%BD%95%E5%AD%98%E6%A1%A3%E5%99%A8.meta.js
// ==/UserScript==

(function() {
~~~~~
~~~~~javascript.new
(function() {
~~~~~

### 下一步建议
1.  **验证构建**: 你现在可以运行 `npm run build`。检查 `dist/` 目录，应该会生成一个 `ponytown-chat-archiver.user.js`。
2.  **本地开发**: 运行 `npm run dev`，点击终端输出的链接安装开发版。你可以尝试修改 `src/main.js` 里的某个 UI 颜色，看看浏览器是否实时生效。
3.  **准备拆分**: 如果一切正常，下一步我们就可以开始把 `src/main.js` 里的各个模块（如 `cleanChannelRecords`, `createUI`）移动到独立的文件中了。
