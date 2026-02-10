我们将“下载”按钮也移入了设置页面，这样主界面将只剩下最核心的频道切换、状态切换和复制功能。同时，我修复了由于 V6 版本数据结构变动（引入了服务器层级）导致下载功能尝试读取错误路径而崩溃的 Bug。

## [WIP] fix(ui): 修复并迁移下载功能至设置页面

### 错误分析
下载功能失效的根本原因是**数据结构不匹配**。
在 V6 版本中，`appState` 的结构从 `Channel -> Messages` 升级为了 `Server -> Channel -> Messages`。原有的 `downloadAllData` 函数在遍历时仍然假设 `appState` 的第一层级是频道，导致尝试对包含频道对象的“服务器对象”调用 `.map()` 方法，从而引发 JavaScript 运行错误并中断了下载流程。

### 用户需求
1.  **修复 Bug**: 恢复下载所有存档的功能（包括 JSON 和 TXT）。
2.  **界面一致性**: 将“下载”按钮从主 Header 移至设置页面的维护操作区。

### 评论
随着功能的增加，将非高频操作（如导出数据）收纳进设置页面是保持 UI 清爽的最佳实践。同时，修复数据遍历逻辑是确保功能可用性的前提。

### 目标
1.  修改 `templates.js`：移除 Header 按钮，并在设置页添加新的下载按钮。
2.  重构 `index.js` 中的 `downloadAllData`：增加对服务器层级的遍历。
3.  确保 TXT 导出格式能够清晰地展示 `服务器 -> 频道` 的隶属关系。

### 标签
#intent/fix #intent/refine #flow/ready #priority/high #comp/ui #concept/parser #scope/ux #ai/brainstorm #task/domain/ui #task/object/download-mechanism #task/action/fix #task/state/continue

---

### Script

#### Acts 1: 重构 HTML 模板 (templates.js)

移除 Header 的下载按钮，将其放入设置页的“维护操作”组合中。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
                <button id="log-archive-stats-button" class="log-archive-ui-button" title="数据统计">📊</button>
                <button id="log-archive-settings-button" class="log-archive-ui-button" title="设置">⚙️</button>
                <button id="log-archive-copy-button" class="log-archive-ui-button" title="复制当前页内容">📋</button>
                <button id="log-archive-download-button" class="log-archive-ui-button" title="下载全部存档">💾</button>
                <button id="log-archive-close-button" class="log-archive-ui-button" title="关闭界面">❌</button>
~~~~~
~~~~~javascript.new
                <button id="log-archive-stats-button" class="log-archive-ui-button" title="数据统计">📊</button>
                <button id="log-archive-settings-button" class="log-archive-ui-button" title="设置">⚙️</button>
                <button id="log-archive-copy-button" class="log-archive-ui-button" title="复制当前页内容">📋</button>
                <button id="log-archive-close-button" class="log-archive-ui-button" title="关闭界面">❌</button>
~~~~~
~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
                    <div class="config-actions" style="display: flex; gap: 10px;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">清理重复记录</button>
                        <button id="log-archive-copy-all-button" class="log-archive-ui-button" style="flex-grow: 1;">导出 JSON</button>
                    </div>
~~~~~
~~~~~javascript.new
                    <div class="config-actions" style="display: flex; gap: 10px;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">清理重复</button>
                        <button id="log-archive-copy-all-button" class="log-archive-ui-button" style="flex-grow: 1;">导出 JSON</button>
                        <button id="log-archive-download-button" class="log-archive-ui-button" style="flex-grow: 1;">下载备份</button>
                    </div>
~~~~~

#### Acts 2: 修复下载逻辑 (index.js)

更新 `downloadAllData` 以支持 V6 的双层嵌套结构 (`Server > Channel`)。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const downloadAllData = () => {
    if (Object.keys(appState).length === 0) return;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const baseFilename = `pt-saver-${timestamp}`;
    let allTextContent = '';
    for (const channelName in appState) {
      allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
      allTextContent += appState[channelName].map(formatMessageForDisplay).join('\n');
    }
    const triggerDownload = (content, filename, mimeType) => {
~~~~~
~~~~~javascript.new
  const downloadAllData = () => {
    if (Object.keys(appState).length === 0) return;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const baseFilename = `pt-saver-${timestamp}`;
    let allTextContent = '';

    // V6 结构: appState[serverName][channelName]
    for (const serverName in appState) {
      allTextContent += `\n\n############################################################\n`;
      allTextContent += `## 服务器: ${serverName}\n`;
      allTextContent += `############################################################\n`;

      const serverData = appState[serverName];
      for (const channelName in serverData) {
        allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
        const messages = serverData[channelName];
        if (Array.isArray(messages)) {
          allTextContent += messages.map(formatMessageForDisplay).join('\n');
        }
      }
    }

    const triggerDownload = (content, filename, mimeType) => {
~~~~~

### 下一步建议
- **分服务器下载**: 随着存档增加，用户可能只想下载“当前查看的服务器”的记录，可以考虑在查看服务器选择器旁边加一个局部的下载图标。
- **导出格式**: 目前是 JSON 和 TXT 双下载，可能会触发浏览器的“多文件下载”拦截警告，可以考虑在设置里增加一个“下载格式”偏好。
- **数据压缩**: 如果存档接近 5MB 限制，TXT 文件的体积可能会很大，后续可以考虑引入简单的压缩库。
