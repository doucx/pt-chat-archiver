这是对 `pt-chat-archiver` UI 的一次重大瘦身。我们将通过将元信息下沉至设置页、使用 Emoji 替代文本按钮来极大减少主界面的空间占用，使界面更加纯粹。

## [WIP] refactor(ui): 瘦身主界面并优化空间利用率

### 用户需求
1.  **界面去载**: 隐藏用户不常关心的版本号、脚本名称和当前录制状态。
2.  **空间紧凑化**: 将主界面控制区的按钮全部替换为 Emoji 符号。
3.  **信息重构**: 将上述被移除的元信息移动到“设置”页面。
4.  **工程优化**: 将 `src/templates.js` 移动到 `src/ui/` 目录下以符合组件化结构。

### 评论
这是一个非常明智的 UX 改进。在持续运行的工具类脚本中，主界面应尽可能低调且节省空间。Emoji 按钮在窄屏或紧凑布局下具有天然的优势。

### 目标
1.  物理移动 `templates.js` 文件。
2.  重构 HTML 模板：移除 Header 中的文字，增加设置页的元信息展示区。
3.  更新渲染逻辑：处理 Emoji 按钮的状态切换（如统计按钮的激活态）。
4.  更新交互反馈：确保复制按钮在点击后依然有“已复制”的反馈。

### 基本原理
通过修改 `templates.js` 定义新的结构，并同步更新 `renderer.js` 和 `events.js` 中依赖 DOM 文本内容的逻辑。所有的元信息（名称、版本、录制状态）将被移动到 `log-archive-config-view` 的顶部。

### 标签
#intent/refine #flow/ready #priority/high #comp/ui #concept/ui #scope/ux #ai/brainstorm #task/domain/ui #task/object/ui-refactor #task/action/cleanup #task/state/begin

---

### Script

#### Acts 1: 文件物理移动与引用更新

首先移动模板文件并修正 `dom.js` 中的引用。

~~~~~act
move_file
src/templates.js
src/ui/templates.js
~~~~~

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
import { TOGGLE_BUTTON_ICON, getMainContainerHTML } from '../templates.js';

let domElements = null;
~~~~~
~~~~~javascript.new
import { TOGGLE_BUTTON_ICON, getMainContainerHTML } from './templates.js';

let domElements = null;
~~~~~

#### Acts 2: 重构 HTML 模板 (templates.js)

我们将 Header 简化，并将元信息移动到 Config 视图。

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
        <div id="log-archive-ui-controls" style="width: 100%; justify-content: space-between;">
            <select id="log-archive-channel-selector" class="log-archive-ui-button" style="flex-grow: 1; margin-right: 10px;"></select>
            <div style="display: flex; gap: 5px;">
                <button id="log-archive-pause-button" class="log-archive-ui-button" title="暂停/恢复录制">⏸️ </button>
                <button id="log-archive-stats-button" class="log-archive-ui-button" title="数据统计">📊</button>
                <button id="log-archive-settings-button" class="log-archive-ui-button" title="设置">⚙️</button>
                <button id="log-archive-copy-button" class="log-archive-ui-button" title="复制当前页内容">📋</button>
                <button id="log-archive-download-button" class="log-archive-ui-button" title="下载全部存档">💾</button>
                <button id="log-archive-close-button" class="log-archive-ui-button" title="关闭界面">❌</button>
            </div>
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
            <!-- 元信息展示区 -->
            <div style="border-bottom: 1px solid var(--color-border); padding-bottom: 15px; margin-bottom: 5px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <h3 style="margin: 0; color: var(--color-primary); font-size: 1.1em;">PT Chat Archiver</h3>
                    <span class="info-text-dim" style="font-size: 0.8em;">v${version}</span>
                </div>
                <div id="log-archive-server-status" style="margin-top: 8px; font-size: 0.85em;">
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
                    切换查看不同服务器的历史记录。注意：此切换仅影响显示，不影响当前的数据录制。
                </div>
            </div>
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" class="info-text-dim" style="margin-bottom: 5px;"></div>
                <div class="config-actions" style="display: flex; gap: 10px;">
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

#### Acts 3: 更新渲染逻辑 (renderer.js)

由于不再通过文字显示“统计/记录”，我们需要调整按钮状态的渲染。

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

#### Acts 4: 更新事件处理中的反馈 (events.js)

针对 Emoji 化的复制按钮，优化“已复制”反馈效果。

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

  dom.copyAllButton.addEventListener('click', () => {
    callbacks.copyAllData();
    const originalText = dom.copyAllButton.textContent;
    dom.copyAllButton.textContent = '已复制 JSON!';
    setTimeout(() => {
      dom.copyAllButton.textContent = originalText;
    }, 1500);
  });
~~~~~
~~~~~javascript.new
  // --- Data export ---
  dom.copyButton.addEventListener('click', () => {
    if (dom.logDisplay.value) {
      navigator.clipboard.writeText(dom.logDisplay.value).then(() => {
        const originalText = dom.copyButton.textContent;
        dom.copyButton.textContent = '✅';
        setTimeout(() => {
          dom.copyButton.textContent = originalText;
        }, 1500);
      });
    }
  });

  dom.copyAllButton.addEventListener('click', () => {
    callbacks.copyAllData();
    const originalText = dom.copyAllButton.textContent;
    dom.copyAllButton.textContent = '已复制 JSON!';
    setTimeout(() => {
      dom.copyAllButton.textContent = originalText;
    }, 1500);
  });
~~~~~

#### Acts 5: 微调样式 (style.css)

既然 Header 变窄了，我们可以微调一下布局。

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
~~~~~
~~~~~css.new
#log-archive-ui-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 5px;
  flex-shrink: 0;
  gap: 10px;
}
~~~~~

### 下一步建议
- **多语言 Tooltip**: 现在的按钮全是 Emoji，虽然有 `title` 属性显示提示，但可以考虑增加更美观的自定义 Tooltip。
- **UI 响应式测试**: 检查在较小屏幕分辨率下，Emoji 按钮排成一排是否会发生溢出。
- **自动保存提醒**: 设置页面可以增加一个“上次保存时间”的显示，增加用户的安全感。
