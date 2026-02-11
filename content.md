你的想法非常实用。在只读模式下明确提示用户，并提供快速返回“活动服务器”的按钮，能显著提升多服务器切换时的操作直觉。同时，针对手机端的布局优化也是非常必要的。

我将生成一个计划来实现这些改进。

## [WIP] feat: 增强只读模式 UI 提示并优化 📍 按钮布局

### 用户需求
1.  **主页面只读提示**：当用户查看的服务器存档不是当前正在记录的服务器时，在日志查看主界面显示明显的“只读模式”提示。
2.  **主页面快速返回**：在主界面的控制栏直接放置 📍 按钮，方便用户一键回到当前活动的服务器。
3.  **布局优化**：修改设置页面中 📍 按钮的显示逻辑，使其在隐藏/显示切换时不会导致布局抖动或向右伸缩（适配移动端）。

### 评论
这些改进直接增强了状态反馈。通过在主界面暴露“返回”操作，用户无需进入设置即可恢复录制视角的同步，符合“直截了当”的交互原则。

### 目标
1.  在 `templates.js` 中添加主界面的 📍 按钮和只读提示占位符。
2.  在 `renderer.js` 中增加状态判断，动态控制这些新元素的显隐和内容。
3.  优化 CSS 布局，确保 📍 按钮所在的 Flex 容器在按钮消失时能平滑自适应，或通过固定空间防止抖动。

### 基本原理
我们将 `activeServer` 与 `viewingServer` 的对等性作为“只读模式”的判定标准。通过在渲染循环中更新 DOM 的 `display` 属性来实现显隐切换。为了优化手机端体验，我们将确保 `select` 元素拥有 `flex-grow: 1` 且 `min-width: 0`，使 📍 按钮的出现仅仅是挤占一点左侧空间，而不是把整个容器撑宽。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #ai/brainstorm #task/domain/ui #task/object/readonly-mode-indicator #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 更新 UI 模板结构

在主界面控制栏增加 📍 按钮，并在日志视图顶部增加只读提示区域。

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
~~~~~
~~~~~javascript.new
    <div id="log-archive-ui-header">
        <div id="log-archive-ui-controls" style="width: 100%; justify-content: space-between;">
            <select id="log-archive-channel-selector" class="log-archive-ui-button" style="flex-grow: 1; margin-right: 5px; min-width: 0;"></select>
            <div style="display: flex; gap: 5px; flex-shrink: 0;">
                <button id="log-archive-header-reset-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="display: none;">📍</button>
                <button id="log-archive-pause-button" class="log-archive-ui-button" title="暂停/恢复录制">⏸️ </button>
~~~~~
~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
    <div id="log-archive-view-container" style="flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
        <!-- 记录查看视图 -->
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
~~~~~
~~~~~javascript.new
    <div id="log-archive-view-container" style="flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
        <!-- 记录查看视图 -->
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-readonly-hint" style="display: none; background: var(--color-warning); color: #000; padding: 4px 10px; font-size: 0.8em; font-weight: bold; text-align: center; flex-shrink: 0;">
                ⚠️ 只读模式：正在查看 [<span></span>] 的存档
            </div>
            <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
~~~~~

#### Acts 2: 注册新 DOM 引用

确保 UI 逻辑可以访问到新添加的按钮和提示框。

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    // Buttons & Inputs
    channelSelector: document.getElementById('log-archive-channel-selector'),
    logDisplay: document.getElementById('log-archive-ui-log-display'),
~~~~~
~~~~~javascript.new
    // Buttons & Inputs
    channelSelector: document.getElementById('log-archive-channel-selector'),
    headerResetButton: document.getElementById('log-archive-header-reset-button'),
    logDisplay: document.getElementById('log-archive-ui-log-display'),
~~~~~
~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    // Status Display
    serverStatus: document.getElementById('log-archive-server-status'),
  };
~~~~~
~~~~~javascript.new
    // Status Display
    serverStatus: document.getElementById('log-archive-server-status'),
    readonlyHint: document.getElementById('log-archive-readonly-hint'),
  };
~~~~~

#### Acts 3: 绑定事件监听

为顶部的 📍 按钮绑定与设置页面按钮相同的返回逻辑。

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
  dom.headerResetButton.addEventListener('click', handleResetServer);
~~~~~

#### Acts 4: 实现渲染控制逻辑

根据只读状态动态控制元素的显示。同时优化按钮显隐逻辑，不再使用 `disabled` 而是使用 `display` 控制，配合 `flex-grow` 解决手机端空间抖动问题。

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
~~~~~
~~~~~javascript.new
    // 2. 更新服务器状态/只读状态显示
    const isReadOnly = activeServer && viewingServer !== activeServer;

    if (dom.readonlyHint) {
      dom.readonlyHint.style.display = isReadOnly && viewMode === 'log' ? 'block' : 'none';
      if (isReadOnly) {
        dom.readonlyHint.querySelector('span').textContent = viewingServer;
      }
    }

    if (dom.headerResetButton) {
      dom.headerResetButton.style.display = isReadOnly ? 'block' : 'none';
    }

    if (dom.serverStatus) {
      if (!activeServer) {
        dom.serverStatus.textContent = '等待进入游戏...';
        dom.serverStatus.style.color = '';
        if (dom.resetServerButton) dom.resetServerButton.style.display = 'none';
      } else if (!isReadOnly) {
        dom.serverStatus.textContent = `✅ 正在记录: ${activeServer}`;
        dom.serverStatus.style.color = 'var(--color-primary-hover)';
        if (dom.resetServerButton) dom.resetServerButton.style.display = 'none';
      } else {
        dom.serverStatus.textContent = `⚠️ 只读模式: 正在查看 ${viewingServer} 存档`;
        dom.serverStatus.style.color = 'var(--color-warning)';
        if (dom.resetServerButton) dom.resetServerButton.style.display = 'block';
      }
    }
~~~~~

### 下一步建议
- **移动端测试**：在不同宽度的设备模拟器上测试顶部 📍 按钮出现时，频道选择器（Channel Selector）的缩放表现，确保其不会遮挡其他功能按钮。
- **持久化只读提醒**：如果用户觉得顶部的黄色横幅太显眼，可以考虑将其改为一种更柔和的背景水印或仅在日志末尾添加一行系统提示。
