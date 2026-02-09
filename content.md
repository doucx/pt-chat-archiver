## [WIP] fix(build): 配置开发服务器以缓解 CSP 拦截问题

### 错误分析
PonyTown 的 CSP 策略禁止加载来自非白名单域名（如本地 127.0.0.1）的脚本。在 `npm run dev` 模式下，Vite 默认的脚本注入方式触发了此安全限制，导致开发版脚本无法启动。

### 用户需求
解决开发环境下的 CSP 拦截错误，使 `npm run dev` 能够正常工作。

### 评论
通过开启 `mountGmApi`，插件会尝试在更高级别的 context 中运行，这有助于在 strict CSP 环境下保持 HMR（热更新）的可用性。但请注意，最根本的解决办法仍然是方法 1 中的扩展设置。

### 目标
更新 `vite.config.js`，增加 `server.mountGmApi` 配置。

### 基本原理
`mountGmApi: true` 会将 `GM_*` API 挂载到 `window` 对象上（受保护的代理），这有时能绕过一些由于执行上下文切换导致的 CSP 限制，并确保在开发模式下功能正常。

### 标签
#intent/fix #flow/ready #priority/high #comp/build #concept/config #scope/dx #ai/instruct #task/domain/build-system #task/object/csp-fix #task/action/config-update #task/state/continue

---

### Script

#### Acts 1: 更新 Vite 配置文件

我们将向 `monkey` 插件配置中添加 `server` 选项。

~~~~~act
patch_file
vite.config.js
~~~~~
~~~~~javascript.old
      build: {
        fileName: 'ponytown-chat-archiver.user.js',
      },
    }),
  ],
});
~~~~~
~~~~~javascript.new
      server: {
        mountGmApi: true,
      },
      build: {
        fileName: 'ponytown-chat-archiver.user.js',
      },
    }),
  ],
});
~~~~~

### 下一步建议

1.  **优先执行“方法 1”**：这是解决 CSP 问题的核心，即使代码配置了 `mountGmApi`，如果油猴扩展本身不拦截 CSP，浏览器依然可能报错。
2.  **重启服务**：修改完 `vite.config.js` 后，建议终止当前的 `npm run dev` 并重新运行。
3.  **检查浏览器控制台**：如果依然报错，请确认是否安装了其他可能强化 CSP 的安全插件（如 Privacy Badger 或某些广告拦截器）。
