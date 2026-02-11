我们将增强只读模式下的用户体验，通过引入柔和的背景水印取代刺眼的警告横幅，并在主界面提供便捷的“返回当前服务器”按钮。同时，我们将对项目结构进行微调，将 CSS 文件移入 UI 模块目录。

## [WIP] feat: 增强只读模式 UI 体验并重构 CSS 目录

### 用户需求
1.  在查看非当前服务器的存档（只读模式）时，在日志主页面添加明显的提示和 📍 快速返回按钮。
2.  优化设置页面 📍 按钮的布局，解决手机端空间挤压问题。
3.  移除顶部的黄色横幅，改用低侵入性的背景水印。
4.  重构：将 `src/style.css` 移动到 `src/ui/style.css`。

### 评论
只读模式的提示应该是“存在感强但干扰性弱”的。背景水印是一个优雅的方案，它既能时刻提醒用户当前状态，又不会遮挡任何内容或导致布局跳变。在主页添加返回按钮极大地提升了多服务器存档切换的效率。

### 目标
1.  将 `style.css` 移动至 `src/ui/` 并更新 `main.js` 的引用。
2.  更新 `templates.js` 为主页面和设置页面添加新的 UI 元素及类名。
3.  在 `dom.js` 中缓存新增的 DOM 引用。
4.  在 `events.js` 中为主页面 📍 按钮绑定逻辑。
5.  在 `renderer.js` 中实现基于状态切换的水印和提示逻辑。
6.  在 `style.css` 中定义水印样式及手机端优化布局。

### 标签
#intent/refine #intent/build #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #scope/dx #ai/brainstorm #task/domain/ui #task/object/readonly-mode #task/action/optimization #task/state/begin

---

### Script

#### Acts 1: 重构 CSS 文件位置

首先移动 CSS 文件并更新入口文件的导入路径。

~~~~~act
move_file
src/style.css
src/ui/style.css
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import './style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
~~~~~
~~~~~javascript.new
import './ui/style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
~~~~~

#### Acts 2: 更新 UI 模板结构

在主页面添加 📍 按钮和只读状态标签，并调整设置界面的布局。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
    <div id="log-archive-ui-header">
        <div id="log-archive-ui-controls" style="width: 100%; justify-content: space-between;">
            <select id="log-archive-channel-selector" class="log-archive-ui-button" style="flex-grow: 1; margin-right: 10px;"></select>
            <div style="display: flex; gap: 5px;">
                <button id="log-archive-pause-button" class="log-archive-ui-button" title="暂停/恢复录制">⏸️ </button>
                <button id="log-archive-stats-button" class="log-archive-ui-button" title="数据统计">📊</button>
~~~~~
~~~~~javascript.new
    <div id="log-archive-ui-header">
        <div id="log-archive-ui-controls" style="width: 100%; justify-content: space-between;">
            <select id="log-archive-channel-selector" class="log-archive-ui-button" style="flex-grow: 1; margin-right: 10px;"></select>
            <div style="display: flex; gap: 5px;">
                <button id="log-archive-main-reset-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="display: none; background-color: var(--color-warning);">📍</button>
                <button id="log-archive-pause-button" class="log-archive-ui-button" title="暂停/恢复录制">⏸️ </button>
                <button id="log-archive-stats-button" class="log-archive-ui-button" title="数据统计">📊</button>
~~~~~
~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
        <!-- 记录查看视图 -->
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
~~~~~
~~~~~javascript.new
        <!-- 记录查看视图 -->
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-readonly-indicator" class="readonly-pill">只读存档模式</div>
            <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
~~~~~
~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
            <div class="config-group">
                <label for="log-archive-server-view-selector">查看存档服务器</label>
                <div style="display: flex; gap: 8px;">
                    <select id="log-archive-server-view-selector" class="log-archive-ui-button" style="flex-grow: 1;"></select>
                    <button id="log-archive-reset-server-button" class="log-archive-ui-button" title="回到正在记录的服务器">📍</button>
                </div>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
~~~~~
~~~~~javascript.new
            <div class="config-group">
                <label for="log-archive-server-view-selector">查看存档服务器</label>
                <div class="config-input-row">
                    <select id="log-archive-server-view-selector" class="log-archive-ui-button" style="flex-grow: 1; min-width: 0;"></select>
                    <button id="log-archive-reset-server-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="flex-shrink: 0;">📍</button>
                </div>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
~~~~~

#### Acts 3: 更新 DOM 引用与事件绑定

确保 JS 能够识别新添加的元素并处理点击事件。

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    settingsButton: document.getElementById('log-archive-settings-button'),
    pauseButton: document.getElementById('log-archive-pause-button'),
    toggleButton: document.getElementById('log-archive-ui-toggle-button'),

    // Config View Controls
~~~~~
~~~~~javascript.new
    settingsButton: document.getElementById('log-archive-settings-button'),
    pauseButton: document.getElementById('log-archive-pause-button'),
    mainResetButton: document.getElementById('log-archive-main-reset-button'),
    readOnlyIndicator: document.getElementById('log-archive-readonly-indicator'),
    toggleButton: document.getElementById('log-archive-ui-toggle-button'),

    // Config View Controls
~~~~~
~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.resetServerButton.addEventListener('click', () => {
    const { activeServer } = uiState.getState();
    if (activeServer) {
      uiState.setViewingServer(activeServer);
      uiState.setPage(1);
      fullRender();
    }
  });

  // --- View switching ---
~~~~~
~~~~~javascript.new
  const handleResetServer = () => {
    const { activeServer } = uiState.getState();
    if (activeServer) {
      uiState.setViewingServer(activeServer);
      uiState.setPage(1);
      fullRender();
    }
  };

  dom.resetServerButton.addEventListener('click', handleResetServer);
  dom.mainResetButton.addEventListener('click', handleResetServer);

  // --- View switching ---
~~~~~

#### Acts 4: 优化渲染器与样式

实现水印逻辑并优化 CSS 布局。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    // 2. 更新服务器状态显示
    if (dom.serverStatus) {
      if (!activeServer) {
        dom.serverStatus.textContent = '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (viewingServer === activeServer) {
        dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}`;
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else {
        dom.serverStatus.textContent = `⚠️ 只读模式: 正在查看 ${viewingServer} 存档`;
        dom.serverStatus.style.color = 'var(--color-warning)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = false;
      }
    }

    // 3. 获取当前服务器数据并更新频道选择器
~~~~~
~~~~~javascript.new
    // 2. 状态判断与 UI 反馈
    const isReadOnly = viewingServer !== activeServer && activeServer !== null;
    dom.uiContainer.classList.toggle('is-readonly', isReadOnly);

    if (dom.readOnlyIndicator) dom.readOnlyIndicator.style.display = isReadOnly ? 'block' : 'none';
    if (dom.mainResetButton) dom.mainResetButton.style.display = isReadOnly ? 'block' : 'none';

    if (dom.serverStatus) {
      if (!activeServer) {
        dom.serverStatus.textContent = '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else if (!isReadOnly) {
        dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}`;
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = true;
      } else {
        dom.serverStatus.textContent = `📖 浏览存档: ${viewingServer}`;
        dom.serverStatus.style.color = 'var(--color-text-dim)';
        if (dom.resetServerButton) dom.resetServerButton.disabled = false;
      }
    }

    // 3. 获取当前服务器数据并更新频道选择器
~~~~~
~~~~~act
patch_file
src/ui/style.css
~~~~~
~~~~~css.old
  font-family: monospace;
  color: var(--color-text);
}

#log-archive-ui-header {
~~~~~
~~~~~css.new
  font-family: monospace;
  color: var(--color-text);
  overflow: hidden; /* 防止水印溢出 */
}

/* 只读模式水印 */
#log-archive-ui-container.is-readonly::before {
  content: 'ARCHIVE READ-ONLY';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-15deg);
  font-size: 5rem;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.03);
  pointer-events: none;
  white-space: nowrap;
  z-index: 0;
}

#log-archive-ui-header {
~~~~~
~~~~~act
patch_file
src/ui/style.css
~~~~~
~~~~~css.old
.info-text-dim {
  color: var(--color-text-dim);
  font-size: 0.85em;
}

/* 设置视图 */
~~~~~
~~~~~css.new
.info-text-dim {
  color: var(--color-text-dim);
  font-size: 0.85em;
}

.readonly-pill {
  background-color: var(--color-warning);
  color: #111;
  font-size: 0.75em;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 10px;
  align-self: center;
  margin-top: 5px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.config-input-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

/* 设置视图 */
~~~~~

### 下一步建议

我们已经完成了 UI 层面对于只读模式的优化。建议下一步进行如下工作：
- **测试验证**: 在手机端检查 📍 按钮是否仍然能保持在一行，不会因为弹性盒子布局导致高度塌陷或宽度溢出。
- **状态持久化**: 目前 `viewingServer` 在刷新后会丢失，可以考虑将其与 `activeServer` 的关联状态存入 `sessionStorage`，以便在页面重连后能保持用户的查看上下文。
