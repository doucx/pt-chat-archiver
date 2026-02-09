这是由于 **PonyTown 启用了极其严格的内容安全策略 (CSP)**。它只允许从它白名单里的域名加载脚本，而你的本地开发服务器 `127.0.0.1` 不在白名单内。

尽管你在 Tampermonkey 里设置了“移除所有 CSP”，但在现代浏览器（尤其是 Chrome）中，由于 Manifest V3 和底层安全机制的限制，这种“移除”有时无法拦截由网页直接触发的脚本加载请求。

---

## [WIP] fix: 解决 PonyTown 严格 CSP 导致无法加载本地开发脚本的问题

### 错误分析

**根本原因**:
PonyTown 的服务器返回了 `content-security-policy` 响应头，其中 `script-src` 只有特定域。Vite 的 `npm run dev` 模式工作原理是：
1.  油猴先安装一个“引导脚本”。
2.  引导脚本在网页里动态创建一个 `<script src="http://127.0.0.1:5173/...">`。
3.  **浏览器** 发现这个地址不符合网页的 CSP 要求，直接拒绝加载。

**为何你的设置没起效**:
虽然 Tampermonkey 尝试清理 CSP，但在某些复杂的单页应用（SPA）和现代浏览器内核下，这种清理可能不彻底，或者被浏览器的内置保护机制覆盖。

### 用户需求
让 Vite 的开发流在 PonyTown 上能够正常运行，实现保存即刷新。

### 评论
对于 CSP 极严的网站（如 GitHub, PonyTown），传统的 `dev` 模式（动态注入脚本）经常受阻。业界公认的“终极方案”是切换到 **Watch 编译模式**。

### 目标
1.  在 `package.json` 中添加 `watch` 指令。
2.  通过编译出真正的 `.user.js` 文件并利用油猴的“本地文件访问”功能，绕过浏览器的 CSP 限制。

### 基本原理
**Watch 模式** 不通过网络加载脚本，而是直接在磁盘上生成最终的脚本文件。
1.  Vite 监视文件变动，一旦保存就重新生成 `dist/xxx.user.js`。
2.  通过开启 Tampermonkey 的“允许访问文件网址”，我们将油猴里的脚本指向这个磁盘路径。
3.  因为代码是直接由油猴注入执行的，而不是通过网页标签加载外部 URL，所以能完美绕开 CSP。

### 标签
#intent/fix #flow/ready #priority/high #comp/build #concept/navigation #scope/dx #ai/instruct #task/domain/build-system #task/object/csp-bypass #task/action/fix #task/state/continue

---

### Script

#### Acts 1: 增加 Watch 脚本指令

修改 `package.json`，增加一个 `watch` 命令。这会让 Vite 在你修改代码时自动重新编译，但不会开启那个会被 CSP 拦截的开发服务器。

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
~~~~~
~~~~~json.new
  "scripts": {
    "dev": "vite",
    "watch": "vite build --watch",
    "build": "vite build",
    "preview": "vite preview"
  },
~~~~~

### 下一步建议 (操作指南)

为了让这个方案生效，你需要手动执行以下一次性设置：

1.  **开启权限**: 
    在浏览器的扩展管理页面 (chrome://extensions)，找到 **Tampermonkey**，点击“详细信息”，开启 **“允许访问文件网址” (Allow access to file URLs)**。

2.  **启动监听**: 
    在终端运行：
    ```bash
    npm run watch
    ```
    它会生成 `dist/ponytown-chat-archiver.user.js`。

3.  **安装本地代理**:
    在油猴里新建一个脚本，内容只保留 Header，并将 `@require` 指向你磁盘上的绝对路径：
    ```javascript
    // ==UserScript==
    // @name         PT Archiver Dev
    // @match        https://pony.town/*
    // @require      file:///你的绝对路径/pt-chat-archiver/dist/ponytown-chat-archiver.user.js
    // ==/UserScript==
    ```
    *(注意：Windows 路径通常是 `file:///C:/path/to/...`)*

4.  **调试**: 
    现在你修改 `src/main.js` 并保存，Vite 会立即更新 `dist` 文件。刷新 PonyTown 页面，你的修改就生效了，完全不再受 CSP 报错的影响。

**如果你完成了上述配置，我们可以继续进行代码的正式拆分。**
