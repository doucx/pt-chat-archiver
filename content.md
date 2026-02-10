由于在之前的代码补丁（`patch_file`）操作中，`src/ui/renderer.js` 的大括号结构在合并时发生了严重损毁，导致大量重复代码及 `if/else` 分支逻辑错位。这引发了 Biome 的语法解析错误（如非法 return 语句和未闭合的块）。

我将使用 `write_file` 重新写入完整的、结构正确的 `renderer.js` 以修复此问题。

## [WIP] fix(ui): repair corrupted syntax in renderer.js

### 错误分析

**错误原因**: 
在执行阶段三的 UI 增强补丁时，`src/ui/renderer.js` 中的 `render` 函数逻辑被意外截断并重复，导致：
1.  **大括号不匹配**: `if (dom.serverStatus)` 块提前闭合，随后的 `else` 语句变成了孤立语句。
2.  **代码重复**: 文件中出现了两段冲突的服务器状态渲染代码。
3.  **解析失败**: `render` 函数的大括号结构损坏，导致其后的所有 `return` 语句被视为位于函数体外部。

### 用户需求
修复渲染器脚本的语法错误，恢复 UI 的正常显示与服务器切换功能。

### 评论
代码损毁是 `patch_file` 在处理复杂嵌套逻辑时的风险点。当 Biome 报出大量 `parse` 错误且涉及 `Illegal return` 时，通常意味着整个文件的闭合逻辑已经崩溃。直接使用 `write_file` 覆盖是目前最稳健的修复方案。

### 目标
1.  彻底清除 `src/ui/renderer.js` 中的重复代码和语法错误。
2.  确保 `render` 函数的逻辑结构（1. 服务器选择, 2. 状态标签, 3. 数据切片, 4. 频道选择）完整且有序。

### 基本原理
重新构建 `src/ui/renderer.js`，确保所有的 `if/else` 分支都有正确的开闭大括号，并且 `render` 闭包能够正确持有其内部引用的所有变量。

### 标签
#intent/fix #flow/ready #priority/critical #comp/ui #concept/ui #scope/core #ai/instruct #task/domain/ui #task/object/renderer #task/action/bug-fix #task/state/continue

---

### Script

#### Acts 1: 重新写入完整的渲染器逻辑

我们将覆盖受损的 `src/ui/renderer.js`，恢复其正确的语法结构。

~~~~~act
write_file
src/ui/renderer.js
~~~~~
~~~~~javascript
import { generateStatisticsText } from '../analysis.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from '../utils.js';

/**
 * Formats a single message object into a display string for the UI or text export.
 * @param {object} msg - The message object.
 * @returns {string} Formatted string.
 */
export function formatMessageForDisplay(msg) {
  let prefix = '';
  if (msg.type.includes('party')) prefix = '👥 ';
  else if (msg.type.includes('whisper')) prefix = '💬 ';
  else if (msg.type.includes('announcement')) prefix = '📣 ';
  const displayTime = formatISOTimeForDisplay(msg.time);
  return `${displayTime} ${prefix}${msg.content}`;
}

/**
 * Creates a renderer instance responsible for updating the UI DOM.
 * @param {object} dom - The DOM elements object from dom.js.
 * @param {object} uiState - The UI state manager from state.js.
 * @returns {object} A renderer instance.
 */
export function createRenderer(dom, uiState) {
  // --- Private Helper Functions ---
  const updateTextareaAndPreserveSelection = (updateFn) => {
    const isFocused = document.activeElement === dom.logDisplay;
    let selectionStart;
    let selectionEnd;
    if (isFocused) {
      selectionStart = dom.logDisplay.selectionStart;
      selectionEnd = dom.logDisplay.selectionEnd;
    }
    updateFn();
    if (isFocused) {
      dom.logDisplay.setSelectionRange(selectionStart, selectionEnd);
    }
  };

  const updateCleanButtonState = (count) => {
    if (count > 0) {
      dom.cleanButton.classList.add('active');
      dom.cleanButton.textContent = `清理重复 (${count})`;
    } else {
      dom.cleanButton.classList.remove('active');
      dom.cleanButton.textContent = '清理重复记录';
    }
  };

  // --- Main Render Logic ---
  const render = (appState, callbacks) => {
    const { viewMode, currentPage, pageSize, viewingServer, activeServer } = uiState.getState();

    // 1. 更新服务器选择器 (v6 特有)
    const servers = Object.keys(appState);
    if (dom.serverViewSelector) {
      const prevServer = dom.serverViewSelector.value;
      dom.serverViewSelector.innerHTML = '';
      if (servers.length === 0) {
        dom.serverViewSelector.innerHTML = '<option value="">无存档</option>';
      } else {
        for (const s of servers) {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s === activeServer ? `${s} (正在记录)` : s;
          dom.serverViewSelector.appendChild(opt);
        }
        dom.serverViewSelector.value = viewingServer || prevServer || servers[0] || '';
      }
    }

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

    // 3. 获取当前查看服务器的数据切片
    const serverData = appState[viewingServer] || {};
    const selectedChannel = dom.channelSelector.value;
    const messages = serverData[selectedChannel] || [];

    // 4. 更新频道选择器
    const channels = Object.keys(serverData);
    const prevChannelValue = dom.channelSelector.value;
    dom.channelSelector.innerHTML = '';
    if (channels.length === 0) {
      dom.channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${serverData[ch].length})`;
        dom.channelSelector.appendChild(opt);
      }
      if (channels.includes(prevChannelValue)) {
        dom.channelSelector.value = prevChannelValue;
      }
    }

    // Toggle view visibility
    dom.logView.style.display = viewMode === 'config' ? 'none' : 'flex';
    dom.configView.style.display = viewMode === 'config' ? 'flex' : 'none';

    // Update button states
    dom.statsButton.classList.toggle('active', viewMode === 'stats');
    dom.statsButton.textContent = viewMode === 'stats' ? '📜 记录' : '📊 统计';
    dom.settingsButton.classList.toggle('active', viewMode === 'config');

    if (viewMode === 'config') {
      const usageMB = getStorageUsageInMB();
      dom.configStorageInfo.textContent = `当前本地存储占用: ${usageMB.toFixed(2)} MB / 5.00 MB`;
      updateCleanButtonState(callbacks.detectTotalDuplicates(appState));
      return;
    }

    if (viewMode === 'stats') {
      dom.paginationControls.style.display = 'none';
      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value = generateStatisticsText(messages, selectedChannel);
      });
    } else {
      // 'log' view
      dom.paginationControls.style.display = 'flex';
      uiState.setTotalPages(Math.ceil(messages.length / pageSize));
      const { totalPages } = uiState.getState(); // Re-fetch after update
      if (currentPage > totalPages) uiState.setPage(totalPages);

      const startIndex = (currentPage - 1) * pageSize;
      const paginatedMessages = messages.slice(startIndex, startIndex + pageSize);

      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value =
          paginatedMessages.length > 0
            ? paginatedMessages.map(formatMessageForDisplay).join('\n')
            : `--- 在频道 [${selectedChannel}] 中没有记录 ---`;
      });

      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = dom.pageLastBtn.disabled = isLast;
    }
  };

  return {
    render,
    checkStorageUsage: () => {
      const usageMB = getStorageUsageInMB();
      let warningElement = document.getElementById('log-archive-storage-warning');
      if (usageMB > 3.5) {
        if (!warningElement) {
          warningElement = document.createElement('div');
          warningElement.id = 'log-archive-storage-warning';
          dom.header.insertBefore(
            warningElement,
            dom.header.querySelector('#log-archive-ui-controls'),
          );
        }
        warningElement.textContent = `⚠️ 存储占用过高 (${usageMB.toFixed(1)}MB)，请及时清理！`;
      } else if (warningElement) {
        warningElement.remove();
      }
    },
  };
}
~~~~~

### 下一步建议
- **执行 `npm run check`**: 验证语法错误是否已完全消除。
- **UI 功能冒烟测试**: 确认服务器选择器和状态提示在各个场景（登录、只读、切换）下均正常工作。
