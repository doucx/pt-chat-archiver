好的。我将在设置页面的“维护操作”部分添加一个实时的存储占用显示，让用户在清理数据或导出之前对当前的存储状况一目了然。

## [WIP] feat: 在设置页面显示实时存储占用信息

### 用户需求
在设置页面展示当前存档在 `localStorage` 中占用的空间大小（MB）。

### 评论
在设置页面显示存储占用是一个非常实用的功能，尤其是在用户准备执行“清理重复”或“清空”等维护操作时，能够提供直接的数据参考。

### 目标
1.  修改 `src/templates.js`，在设置视图中添加存储信息的显示占位符。
2.  修改 `src/ui.js`，在渲染设置视图时计算并更新存储占用文本。

### 标签
#intent/build #flow/ready #priority/low #comp/ui #concept/config #scope/ux #ai/delegate #task/domain/ui #task/object/settings-view #task/action/refine #task/state/continue

---

### Script

#### Acts 1: 在模板中添加存储信息占位符

我们将信息放在“维护操作”的标签下方。

~~~~~act
patch_file
src/templates.js
~~~~~
~~~~~html.old
            <div class="config-group">
                <label>维护操作</label>
                <div class="config-actions">
                    <button id="log-archive-clean-button" class="log-archive-ui-button">清理重复记录</button>
                    <button id="log-archive-copy-all-button" class="log-archive-ui-button">导出原始数据 (JSON)</button>
                </div>
            </div>
~~~~~
~~~~~html.new
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" style="color: #a0c8ff; font-size: 0.85em; margin-bottom: 5px;"></div>
                <div class="config-actions">
                    <button id="log-archive-clean-button" class="log-archive-ui-button">清理重复记录</button>
                    <button id="log-archive-copy-all-button" class="log-archive-ui-button">导出原始数据 (JSON)</button>
                </div>
            </div>
~~~~~

#### Acts 2: 在 `ui.js` 中实现存储信息更新逻辑

获取 DOM 引用，并在进入设置视图时更新内容。

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  const pageSizeInput = document.getElementById('log-archive-page-size-input');
  const cleanButton = document.getElementById('log-archive-clean-button');
  const copyAllButton = document.getElementById('log-archive-copy-all-button');
  const clearButton = document.getElementById('log-archive-clear-button');
~~~~~
~~~~~javascript.new
  const pageSizeInput = document.getElementById('log-archive-page-size-input');
  const configStorageInfo = document.getElementById('log-archive-config-storage-info');
  const cleanButton = document.getElementById('log-archive-clean-button');
  const copyAllButton = document.getElementById('log-archive-copy-all-button');
  const clearButton = document.getElementById('log-archive-clear-button');
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
    settingsButton.classList.toggle('active', isConfigMode);

    if (isConfigMode) {
      updateCleanButtonState(detectTotalDuplicates(inMemoryChatState));
      return;
    }
~~~~~
~~~~~javascript.new
    settingsButton.classList.toggle('active', isConfigMode);

    if (isConfigMode) {
      const usageMB = getStorageUsageInMB();
      configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;
      updateCleanButtonState(detectTotalDuplicates(inMemoryChatState));
      return;
    }
~~~~~

### 下一步建议
1.  **验证显示**: 进入设置页面，确认是否出现了“当前本地存储占用: X.XX MB”的字样。
2.  **验证同步**: 点击“清理重复”并确认后，观察该数值是否相应减少（如果有大量数据被清理）。
3.  **最终检查**: 本阶段 UI 重构已基本完成，建议进行一次完整的测试并提交。
