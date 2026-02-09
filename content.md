这是一个非常合理的 UX 改进。通过改变按钮的文本和颜色，用户可以直观地知道当前处于哪种视图模式。

我将修改 `src/ui.js` 中的渲染逻辑，使得“统计”按钮在激活时显示为“📜 记录”并保持高亮颜色。

## [WIP] style: 增强统计按钮的交互反馈与文本切换

### 用户需求
点击“统计”按钮进入统计视图后，按钮应变色并切换文本为“记录”，以便用户一键返回。

### 评论
这种模式切换（Toggle）的设计符合用户直觉，能有效减少顶栏按钮的冗余感。

### 目标
1.  修改 `src/ui.js` 中的 `renderCurrentView` 函数。
2.  根据 `uiState.viewMode` 动态设置 `statsButton` 的 `textContent` 和 `.active` 类。

### 标签
#intent/tune #flow/ready #priority/low #comp/ui #scope/ux #ai/delegate #task/domain/ui #task/object/stats-button #task/action/refine #task/state/continue

---

### Script

#### Acts 1: 更新 `ui.js` 中的视图切换逻辑

我们将修改 `renderCurrentView` 函数中处理按钮状态的部分，并微调事件监听器。

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  // --- 渲染核心 ---
  function renderCurrentView() {
    const selectedChannel = channelSelector.value;
    const messages = inMemoryChatState[selectedChannel] || [];

    // 视图可见性切换
    logView.style.display = uiState.viewMode === 'config' ? 'none' : 'flex';
    configView.style.display = uiState.viewMode === 'config' ? 'flex' : 'none';
    
    // 按钮激活状态
    statsButton.classList.toggle('active', uiState.viewMode === 'stats');
    settingsButton.classList.toggle('active', uiState.viewMode === 'config');

    if (uiState.viewMode === 'config') {
      updateCleanButtonState(detectTotalDuplicates(inMemoryChatState));
      return;
    }

    if (uiState.viewMode === 'stats') {
~~~~~
~~~~~javascript.new
  // --- 渲染核心 ---
  function renderCurrentView() {
    const selectedChannel = channelSelector.value;
    const messages = inMemoryChatState[selectedChannel] || [];

    // 视图可见性切换
    logView.style.display = uiState.viewMode === 'config' ? 'none' : 'flex';
    configView.style.display = uiState.viewMode === 'config' ? 'flex' : 'none';
    
    // 按钮激活状态与文本切换
    const isStatsMode = uiState.viewMode === 'stats';
    const isConfigMode = uiState.viewMode === 'config';

    statsButton.classList.toggle('active', isStatsMode);
    statsButton.textContent = isStatsMode ? '📜 记录' : '📊 统计';
    
    settingsButton.classList.toggle('active', isConfigMode);

    if (isConfigMode) {
      updateCleanButtonState(detectTotalDuplicates(inMemoryChatState));
      return;
    }

    if (isStatsMode) {
~~~~~

### 下一步建议
1.  **测试交互**: 点击“📊 统计”，确认它变成了“📜 记录”且颜色变为绿色（或 `style.css` 中定义的 `.active` 颜色）。
2.  **验证一致性**: 进入设置页面时，确认统计按钮恢复为“📊 统计”且不带高亮。
3.  **提交**: 功能确认无误后即可提交代码。
