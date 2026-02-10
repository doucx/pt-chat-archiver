这是一个提升多服务器管理效率的极佳功能建议。

在存档数量较多时，能够“一键归位”到当前活跃的服务器，极大地优化了用户在查看历史记录和监控实时数据之间的切换体验。

我将生成一个计划来实现这个“定位”按钮及其相关逻辑。

## [WIP] feat(ui): add 'Return to Active Server' shortcut button

### 用户需求
在设置界面的“查看存档服务器”下拉菜单旁边添加一个按钮（例如使用“📍”图标），点击后 UI 将立即切换回当前正在录制数据的服务器视图。

### 评论
这个快捷方式解决了用户在翻阅多个历史存档后，需要快速回到当前上下文的痛点。它与之前的“正在记录”标注相辅相成，共同构成了一个完整的服务器导航体验。

### 目标
1. 修改 `src/templates.js` 增加按钮 HTML 结构。
2. 修改 `src/ui/dom.js` 注册新按钮引用。
3. 修改 `src/ui/events.js` 绑定跳转逻辑。
4. 修改 `src/ui/renderer.js` 在适当时候禁用该按钮（如未进入游戏或已在当前视图）。

### 基本原理
我们在 `uiState` 中已经维护了 `activeServer`（物理服务器）和 `viewingServer`（当前查看服务器）。点击新按钮时，只需将 `viewingServer` 设置为 `activeServer` 并触发重新渲染。为了保证 UI 严谨性，当用户未进入游戏（即没有正在记录的服务器）时，该按钮应当处于禁用状态。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #concept/navigation #scope/ux #ai/instruct #task/domain/ui #task/object/server-navigation #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 更新 UI 模板结构

在 `templates.js` 中，我们将下拉框和新按钮放入一个 flex 容器中，以便它们并排显示。

~~~~~act
patch_file
src/templates.js
~~~~~
~~~~~javascript.old
        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <div class="config-group">
                <label>查看存档服务器</label>
                <select id="log-archive-server-view-selector" class="log-archive-ui-button"></select>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    切换查看不同服务器的历史记录。注意：此切换仅影响显示，不影响当前的数据录制。
                </div>
            </div>
~~~~~
~~~~~javascript.new
        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
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
~~~~~

#### Acts 2: 注册 DOM 元素

在 `dom.js` 中添加对新按钮的引用。

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    // Config View Controls
    serverViewSelector: document.getElementById('log-archive-server-view-selector'),
    selfNameInput: document.getElementById('log-archive-self-name-input'),
~~~~~
~~~~~javascript.new
    // Config View Controls
    serverViewSelector: document.getElementById('log-archive-server-view-selector'),
    resetServerButton: document.getElementById('log-archive-reset-server-button'),
    selfNameInput: document.getElementById('log-archive-self-name-input'),
~~~~~

#### Acts 3: 绑定跳转事件

在 `events.js` 中实现点击跳转逻辑。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.serverViewSelector.addEventListener('change', () => {
    uiState.setViewingServer(dom.serverViewSelector.value);
    uiState.setPage(1);
    fullRender();
  });

  // --- View switching ---
~~~~~
~~~~~javascript.new
  dom.serverViewSelector.addEventListener('change', () => {
    uiState.setViewingServer(dom.serverViewSelector.value);
    uiState.setPage(1);
    fullRender();
  });

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

#### Acts 4: 增强渲染状态控制

在 `renderer.js` 中，根据当前状态启用或禁用该按钮。

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
      } else if (viewingServer === activeServer) {
~~~~~
~~~~~javascript.new
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
~~~~~

### 下一步建议
- **多存档测试**: 确保你拥有至少两个不同服务器的存档，尝试在它们之间切换，并测试 📍 按钮是否能正确跳回当前活跃服务器。
- **状态验证**: 检查在未登录游戏（主菜单）时，该按钮是否正确处于禁用（灰色）状态。
- **UI 风格检查**: 观察 📍 图标在不同缩放比例下的显示效果，确保它与旁边的下拉框高度一致。
