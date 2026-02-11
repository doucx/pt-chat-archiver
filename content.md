我们将进一步精细化只读模式的视觉表现，通过隐藏不相关功能（录制暂停）并弱化提示按钮的视觉强度，让界面更加简洁聚焦。

## [WIP] feat: 进一步精细化只读模式 UI 交互

### 用户需求
1.  主页面上的 📍 按钮移除黄色背景，改用默认按钮样式，降低视觉干扰。
2.  进入只读模式时，自动隐藏 ⏸️ (暂停) 按钮，因为此时的操作对象是静态存档而非实时录制。

### 评论
这是一个非常合理的减法设计。只读模式下展示“录制暂停”按钮会产生歧义，因为用户可能会误以为点击它可以暂停当前对活动服务器的后台录制。通过隐藏该按钮并弱化 📍 按钮，我们将“浏览存档”这一行为变得更加纯粹。

### 目标
1.  修改 `templates.js`，移除主页面 📍 按钮的黄色背景内联样式。
2.  更新 `renderer.js` 的渲染逻辑，使其在只读模式下根据 `isReadOnly` 状态切换 ⏸️ 按钮的可见性。

### 基本原理
利用 `renderer.js` 中已计算出的 `isReadOnly` 布尔值，通过操作 DOM 的 `display` 属性来同步多个 UI 元素的显隐状态。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/readonly-mode #task/action/optimization #task/state/continue

---

### Script

#### Acts 1: 弱化 📍 按钮视觉并更新隐藏逻辑

我们将修改模板中的内联样式，并在渲染循环中处理 ⏸️ 按钮的显隐。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
        <div id="log-archive-ui-controls" style="width: 100%; justify-content: space-between;">
            <select id="log-archive-channel-selector" class="log-archive-ui-button" style="flex-grow: 1; margin-right: 10px;"></select>
            <div style="display: flex; gap: 5px;">
                <button id="log-archive-main-reset-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="display: none; background-color: var(--color-warning);">📍</button>
                <button id="log-archive-pause-button" class="log-archive-ui-button" title="暂停/恢复录制">⏸️ </button>
                <button id="log-archive-stats-button" class="log-archive-ui-button" title="数据统计">📊</button>
~~~~~
~~~~~javascript.new
        <div id="log-archive-ui-controls" style="width: 100%; justify-content: space-between;">
            <select id="log-archive-channel-selector" class="log-archive-ui-button" style="flex-grow: 1; margin-right: 10px;"></select>
            <div style="display: flex; gap: 5px;">
                <button id="log-archive-main-reset-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="display: none;">📍</button>
                <button id="log-archive-pause-button" class="log-archive-ui-button" title="暂停/恢复录制">⏸️ </button>
                <button id="log-archive-stats-button" class="log-archive-ui-button" title="数据统计">📊</button>
~~~~~

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    if (dom.readOnlyIndicator) dom.readOnlyIndicator.style.display = isReadOnly ? 'block' : 'none';
    if (dom.mainResetButton) dom.mainResetButton.style.display = isReadOnly ? 'block' : 'none';

    if (dom.serverStatus) {
~~~~~
~~~~~javascript.new
    if (dom.readOnlyIndicator) dom.readOnlyIndicator.style.display = isReadOnly ? 'block' : 'none';
    if (dom.mainResetButton) dom.mainResetButton.style.display = isReadOnly ? 'block' : 'none';
    if (dom.pauseButton) dom.pauseButton.style.display = isReadOnly ? 'none' : 'block';

    if (dom.serverStatus) {
~~~~~

### 下一步建议

当前任务序列进展顺利。下一步建议：
- **统计报告一致性**: 目前 `generateStatisticsText` 已经支持分析任何传入的消息数组。我们可以检查一下当在只读模式（即查看非活动服务器）时，统计报告的抬头是否能正确反映出当前所查看的服务器名称。
- **UI 状态持久化**: 在用户切换到只读模式并关闭 UI 后，再次打开时应当保持在同一服务器的同一页面。我们可以确认一下 `ui/state.js` 的内存状态是否能很好地处理这种关闭后的状态保持。
