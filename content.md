好的，既然目前系统已经能够很好地自动处理消息合并，手动刷新按钮确实显得冗余了。

我将从模板中移除该按钮，并清理 `ui.js` 中相关的引用和事件绑定。

## [WIP] chore: 移除冗余的刷新按钮

### 用户需求
删除 UI 顶栏中的“刷新”按钮。

### 评论
系统目前通过 `MutationObserver` 和 `scanAndMergeHistory` 逻辑已经实现了较好的自动化更新，且进入 UI 时会自动执行同步，手动刷新按钮的维护价值已不高。

### 目标
1.  从 `src/templates.js` 的 HTML 模板中移除 `log-archive-refresh-button`。
2.  从 `src/ui.js` 中移除对该按钮的 DOM 引用和点击事件监听器。

### 标签
#intent/refine #flow/ready #priority/low #comp/ui #scope/ux #ai/delegate #task/domain/ui #task/object/refresh-button #task/action/cleanup #task/state/continue

---

### Script

#### Acts 1: 从模板中移除按钮

~~~~~act
patch_file
src/templates.js
~~~~~
~~~~~html.old
        <div id="log-archive-ui-controls">
            <select id="log-archive-channel-selector" class="log-archive-ui-button"></select>
            <button id="log-archive-refresh-button" class="log-archive-ui-button">刷新</button>
            <button id="log-archive-pause-button" class="log-archive-ui-button">⏸️ </button>
            <button id="log-archive-stats-button" class="log-archive-ui-button">📊 统计</button>
~~~~~
~~~~~html.new
        <div id="log-archive-ui-controls">
            <select id="log-archive-channel-selector" class="log-archive-ui-button"></select>
            <button id="log-archive-pause-button" class="log-archive-ui-button">⏸️ </button>
            <button id="log-archive-stats-button" class="log-archive-ui-button">📊 统计</button>
~~~~~

#### Acts 2: 从 `ui.js` 中清理逻辑

移除 DOM 引用和事件监听代码。

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  const channelSelector = document.getElementById('log-archive-channel-selector');
  const logDisplay = document.getElementById('log-archive-ui-log-display');
  const copyButton = document.getElementById('log-archive-copy-button');
  const closeButton = document.getElementById('log-archive-close-button');
  const refreshButton = document.getElementById('log-archive-refresh-button');
  const downloadButton = document.getElementById('log-archive-download-button');
  const statsButton = document.getElementById('log-archive-stats-button');
~~~~~
~~~~~javascript.new
  const channelSelector = document.getElementById('log-archive-channel-selector');
  const logDisplay = document.getElementById('log-archive-ui-log-display');
  const copyButton = document.getElementById('log-archive-copy-button');
  const closeButton = document.getElementById('log-archive-close-button');
  const downloadButton = document.getElementById('log-archive-download-button');
  const statsButton = document.getElementById('log-archive-stats-button');
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  statsButton.addEventListener('click', () => {
    uiState.viewMode = uiState.viewMode === 'stats' ? 'log' : 'stats';
    renderCurrentView();
  });

  // 顶栏通用操作
  refreshButton.addEventListener('click', () => {
    scanAndMergeHistory();
    saveMessagesToStorage(inMemoryChatState);
    updateUI();
  });

  pauseButton.addEventListener('click', () => {
~~~~~
~~~~~javascript.new
  statsButton.addEventListener('click', () => {
    uiState.viewMode = uiState.viewMode === 'stats' ? 'log' : 'stats';
    renderCurrentView();
  });

  // 顶栏通用操作
  pauseButton.addEventListener('click', () => {
~~~~~

### 下一步建议
1.  **检查 UI**: 确认刷新按钮已消失，且顶栏布局依然整齐。
2.  **验证核心流程**: 确认由于移除按钮没有引起脚本报错（JS Error），且其他按钮功能正常。
3.  **最终提交**: 建议执行 `git commit` 将这一系列 UI 改进永久化。
