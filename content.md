简要回答
完全同意。在实现了增量写入（每条消息即刻持久化）后，手动触发全量保存的“立刻保存”按钮不仅多余，而且容易误导用户。现在数据的安全性由数据库层实时保证，我们可以清理掉这些过时的 UI 元素。

## [WIP] style(ui): 移除过时的“立刻保存”按钮和相关逻辑

### 错误分析
无。这是基于存储架构升级（从全量保存转为增量写入）后的 UI 优化。

### 用户需求
删除 UI 界面中不再需要的“立刻保存”按钮。

### 评论
删除此按钮标志着系统正式告别了“基于 JSON 快照”的旧时代。这也简化了设置界面的布局，使用户能够专注于真正的维护操作（如导入和清理）。

### 目标
1. 从 `templates.js` 中移除“立刻保存”按钮和“上次保存时间”的 HTML 结构。
2. 从 `dom.js` 中移除对应的 DOM 元素引用。
3. 从 `events.js` 中移除点击事件监听器。
4. 在 `renderer.js` 中移除对上次保存时间的渲染逻辑。
5. 清理 `index.js` 和 `main.js` 中遗留的相关方法。

### 标签
#intent/refine #flow/ready #priority/low #comp/ui #scope/ux #ai/instruct #task/domain/ui #task/object/save-button #task/action/remove #task/state/end

---

### Script

#### Acts 1: 修改 UI 模板
移除 HTML 中负责显示保存按钮和状态信息的容器。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript
                <div id="log-archive-config-msg-count" class="info-text-dim" style="margin-bottom: 8px;"></div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button id="log-archive-save-now-button" class="log-archive-ui-button" style="flex-grow: 1;">💾 立即保存</button>
                        <span id="log-archive-last-saved-info" class="info-text-dim" style="font-size: 0.8em; white-space: nowrap;">未保存</span>
                    </div>
                    
                    <div class="config-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
~~~~~
~~~~~javascript
                <div id="log-archive-config-msg-count" class="info-text-dim" style="margin-bottom: 8px;"></div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div class="config-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
~~~~~

#### Acts 2: 清理 DOM 引用
从 `domElements` 缓存中删除已不存在的元素。

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    autoSaveIntervalInput: document.getElementById('log-archive-auto-save-interval'),
    lastSavedInfo: document.getElementById('log-archive-last-saved-info'),
    saveNowButton: document.getElementById('log-archive-save-now-button'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
~~~~~
~~~~~javascript
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    autoSaveIntervalInput: document.getElementById('log-archive-auto-save-interval'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
~~~~~

#### Acts 3: 移除事件监听器
删除对保存按钮的点击处理逻辑。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript
  dom.autoFollowInput.addEventListener('change', async () => {
    await uiState.setAutoFollowServer(dom.autoFollowInput.checked);
    triggerRefresh();
  });

  dom.saveNowButton.addEventListener('click', async () => {
    await callbacks.manualSave();
    const originalText = dom.saveNowButton.textContent;
    dom.saveNowButton.textContent = '✅ 已保存';
    setTimeout(() => {
      dom.saveNowButton.textContent = originalText;
    }, UI_FEEDBACK_DURATION);
  });

  dom.cleanButton.addEventListener('click', async () => {
~~~~~
~~~~~javascript
  dom.autoFollowInput.addEventListener('change', async () => {
    await uiState.setAutoFollowServer(dom.autoFollowInput.checked);
    triggerRefresh();
  });

  dom.cleanButton.addEventListener('click', async () => {
~~~~~

#### Acts 4: 移除渲染逻辑
删除在 Renderer 中对保存时间的显示处理。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript
      if (storageManager.hasV6Backup()) {
        dom.deleteBackupGroup.style.display = 'flex';
      } else {
        dom.deleteBackupGroup.style.display = 'none';
      }

      const { lastSavedTime } = uiState.getState();
      if (lastSavedTime) {
        dom.lastSavedInfo.textContent = `上次保存: ${formatISOTimeForDisplay(lastSavedTime).split(' ')[1]}`;
      } else {
        dom.lastSavedInfo.textContent = '尚未保存';
      }

      // 计算重复项总数 (需要从 callbacks 获取全量数据进行计算，或者由上层计算后传入)
~~~~~
~~~~~javascript
      if (storageManager.hasV6Backup()) {
        dom.deleteBackupGroup.style.display = 'flex';
      } else {
        dom.deleteBackupGroup.style.display = 'none';
      }

      // 计算重复项总数 (需要从 callbacks 获取全量数据进行计算，或者由上层计算后传入)
~~~~~

#### Acts 5: 最终代码清理
移除 `ui/index.js` 对外暴露的已失效方法。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      refreshView();
    },
    setLastSavedTime: (time) => {
      uiState.setLastSavedTime(time);
      refreshView();
    },
    getAutoSaveInterval: () => uiState.getState().autoSaveInterval,
~~~~~
~~~~~javascript
    isUIPaused: () => uiState.getState().isUIPaused,
    updateServerDisplay: (serverName) => {
      uiState.setActiveServer(serverName);
      refreshView();
    },
    getAutoSaveInterval: () => uiState.getState().autoSaveInterval,
~~~~~

### 下一步建议
通过移除这些旧时代的痕迹，界面变得更加清爽且符合其真正的运行逻辑。至此，Phase 2 的所有工作已圆满完成。

系统现在拥有了一个高效、增量、基于索引的数据库底层。接下来我们可以开始执行 **Phase 3：引入 Web Worker**，将数据库操作移出主线程，彻底消除在进行大型数据库读写时可能产生的微小掉帧。
