这是一个非常合理的 UX 改进建议。

在 v6 版本引入多服务器支持后，顶部的元信息（名称、版本、状态）确实占据了过多空间。通过将非核心信息迁移到设置页面，并使用 Emoji 替代文字按钮，我们可以将主界面的视觉重心完全交还给“聊天记录”本身，同时在设置页面提供更完整的系统概览。

我将为您生成执行此项优化的计划。

## [WIP] refactor(ui): 精简主界面布局并迁移元信息至设置页

### 用户需求
1.  **精简 Header**: 移除主界面头部的应用名称、版本号和服务器录制状态，将其迁移到“设置”页面。
2.  **控件 Emoji 化**: 将“统计”、“设置”、“复制”、“下载”、“关闭”等文字按钮全部替换为 Emoji。
3.  **交互保留**: 保留“复制”按钮点击后的文字反馈逻辑。
4.  **空间优化**: 通过上述改动压缩顶部控件栏的垂直和水平空间占用。

### 评论
将技术元数据（版本、当前录制状态）从主视图剥离是符合“内容优先”原则的。用户在使用存档器时，90% 的时间是在查阅记录或进行统计，而不是关注脚本本身的版本。Emoji 按钮不仅节省空间，也使得 UI 更加现代化和直观。

### 目标
1.  修改 `templates.js`：重构 HTML 结构，将标题和状态指示器移入 `config-view`。
2.  更新按钮定义，使用 Emoji 并添加 `title` 属性（Tooltip）以保证无障碍性。
3.  修改 `renderer.js`：适配 Emoji 按钮的文本切换逻辑（统计/记录切换）。
4.  修改 `events.js`：优化“复制”按钮的反馈逻辑，使其在 Emoji 和文字之间平滑切换。
5.  修改 `style.css`：优化按钮样式，确保 Emoji 按钮在不同状态下有清晰的视觉反馈。
6.  升级 `package.json` 版本至 `6.2.0`。

### 基本原理
通过修改 `templates.js` 中的模板字符串，我们重新定义了 UI 的骨架。在 `renderer.js` 中，我们调整了 `render` 函数对 `statsButton` 的文本控制逻辑，使其仅在 `📊` 和 `📜` 两个 Emoji 之间切换。由于 `events.js` 使用 `dom.copyButton.textContent` 暂存原始状态，Emoji 按钮会自动兼容该反馈逻辑，只需微调样式确保按钮宽度在显示文字时能自适应即可。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #ai/brainstorm #task/domain/ui #task/object/header-refactor #task/action/optimize #task/state/begin

---

### Script

#### Acts 1: 更新版本号与样式

我们将版本号升至 `6.2.0`，并调整 CSS 以支持更紧凑的按钮布局。

~~~~~act
patch_file
package.json
~~~~~
~~~~~json.old
  "name": "pt-chat-archiver",
  "private": true,
  "version": "6.1.0",
~~~~~
~~~~~json.new
  "name": "pt-chat-archiver",
  "private": true,
  "version": "6.2.0",
~~~~~

~~~~~act
patch_file
src/style.css
~~~~~
~~~~~css.old
#log-archive-ui-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 10px;
}

#log-archive-ui-header h2 {
  margin: 0;
  font-size: 1.2em;
  color: var(--color-primary);
  flex-shrink: 0;
  margin-right: 15px;
}

#log-archive-ui-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
~~~~~
~~~~~css.new
#log-archive-ui-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 8px;
  flex-shrink: 0;
}

#log-archive-ui-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  width: 100%;
}

#log-archive-channel-selector {
  flex-grow: 1;
  min-width: 120px;
}
~~~~~

#### Acts 2: 重构 HTML 模板

将元信息迁移到设置视图，并将控制按钮改为 Emoji。

~~~~~act
write_file
src/ui/templates.js
~~~~~
~~~~~javascript
/**
 * 返回 UI 主容器的 HTML 结构。
 * @param {string} version - 应用程序版本号。
 * @returns {string}
 */
export const getMainContainerHTML = (version) => `
    <div id="log-archive-ui-header">
        <div id="log-archive-ui-controls">
            <select id="log-archive-channel-selector" class="log-archive-ui-button"></select>
            <button id="log-archive-pause-button" class="log-archive-ui-button" title="暂停/运行">⏸️ </button>
            <button id="log-archive-stats-button" class="log-archive-ui-button" title="统计报告">📊</button>
            <button id="log-archive-settings-button" class="log-archive-ui-button" title="设置">⚙️</button>
            <button id="log-archive-copy-button" class="log-archive-ui-button" title="复制当前页内容">📋</button>
            <button id="log-archive-download-button" class="log-archive-ui-button" title="下载全部数据">💾</button>
            <button id="log-archive-close-button" class="log-archive-ui-button" title="关闭界面">❌</button>
        </div>
    </div>
    
    <div id="log-archive-view-container" style="flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
        <!-- 记录查看视图 -->
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
                <button id="page-first" class="log-archive-ui-button">«</button>
                <button id="page-prev" class="log-archive-ui-button">‹</button>
                <span id="page-info" class="info-text-primary"></span>
                <button id="page-next" class="log-archive-ui-button">›</button>
                <button id="page-last" class="log-archive-ui-button">»</button>
            </div>
            <textarea id="log-archive-ui-log-display" readonly style="margin-top: 10px; flex-grow: 1;"></textarea>
        </div>

        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <div class="config-group" style="border-bottom: 1px solid var(--color-border); padding-bottom: 10px; margin-bottom: 10px;">
                <h2 style="margin: 0; font-size: 1.1em; color: var(--color-primary);">PonyTown Archiver v${version}</h2>
                <div id="log-archive-server-status" class="info-text-dim" style="font-size: 0.85em; margin-top: 4px;">
                    检测中...
                </div>
            </div>

            <div class="config-group">
                <label>查看存档服务器</label>
                <div style="display: flex; gap: 8px;">
                    <select id="log-archive-server-view-selector" class="log-archive-ui-button" style="flex-grow: 1;"></select>
                    <button id="log-archive-reset-server-button" class="log-archive-ui-button" title="回到正在记录的服务器">📍</button>
                </div>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    切换查看不同服务器的历史记录。注意：此切换不影响当前的数据录制。
                </div>
            </div>
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>维护与导出</label>
                <div id="log-archive-config-storage-info" class="info-text-dim" style="margin-bottom: 5px;"></div>
                <div class="config-actions" style="display: flex; gap: 8px;">
                    <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">清理重复记录</button>
                    <button id="log-archive-copy-all-button" class="log-archive-ui-button" style="flex-grow: 1;">导出 JSON</button>
                </div>
            </div>
            <div class="config-group" style="margin-top: auto; border-top: 1px dashed #444; padding-top: 20px;">
                <label style="color: #ff6666;">危险操作</label>
                <button id="log-archive-clear-button" class="log-archive-ui-button">清空所有本地存档</button>
            </div>
        </div>
    </div>
`;

export const TOGGLE_BUTTON_ICON = '📜';
~~~~~

#### Acts 3: 适配 Renderer 与事件反馈逻辑

修改 `renderer.js` 以支持 Emoji 按钮切换，并微调 `events.js` 中的反馈逻辑。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    // Update button states
    dom.statsButton.classList.toggle('active', viewMode === 'stats');
    dom.statsButton.textContent = viewMode === 'stats' ? '📜 记录' : '📊 统计';
    dom.settingsButton.classList.toggle('active', viewMode === 'config');
~~~~~
~~~~~javascript.new
    // Update button states
    dom.statsButton.classList.toggle('active', viewMode === 'stats');
    dom.statsButton.textContent = viewMode === 'stats' ? '📜' : '📊';
    dom.settingsButton.classList.toggle('active', viewMode === 'config');
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  // --- Data export ---
  dom.copyButton.addEventListener('click', () => {
    if (dom.logDisplay.value) {
      navigator.clipboard.writeText(dom.logDisplay.value).then(() => {
        const originalText = dom.copyButton.textContent;
        dom.copyButton.textContent = '已复制!';
        setTimeout(() => {
          dom.copyButton.textContent = originalText;
        }, 1500);
      });
    }
  });
~~~~~
~~~~~javascript.new
  // --- Data export ---
  dom.copyButton.addEventListener('click', () => {
    if (dom.logDisplay.value) {
      navigator.clipboard.writeText(dom.logDisplay.value).then(() => {
        const originalText = dom.copyButton.textContent;
        dom.copyButton.textContent = '已复制!';
        dom.copyButton.style.minWidth = '60px'; // 防止文字显示不全
        setTimeout(() => {
          dom.copyButton.textContent = originalText;
          dom.copyButton.style.minWidth = '';
        }, 1500);
      });
    }
  });
~~~~~

### 下一步建议
- **UI 紧凑度检查**: 在 PonyTown 实际环境中测试 UI，观察顶部控制栏在小分辨率屏幕下的折行情况。
- **Tooltip 优化**: 当前使用了原生 `title` 属性，如果追求更好的视觉效果，未来可以考虑实现一个简单的自定义 Tooltip 组件，使 Emoji 按钮的功能提示更加美观。
- **状态持久化**: 可以考虑让 UI 记住最后一次打开的是哪个服务器的存档，提升用户体验。
