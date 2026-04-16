这是一个非常棒的 UX 改进建议。在处理大量聊天记录（尤其是初次进场扫描或切换频道时）时，由于 DOM 解析和数据库写入可能产生微小的延迟，明确的进度反馈能让用户知道程序并未“卡死”。

我将为系统添加一个统一的进度条覆盖层，并将其集成到历史扫描、重复项清理和数据加载流程中。

## [WIP] feat: 为历史扫描与数据处理添加进度条 UI

### 用户需求
在加载历史记录（或执行耗时操作）时显示进度条和具体的数值进度（如 `20/1000`），以提升用户在处理大量数据时的反馈体验。

### 评论
当前系统在加载时仅显示一个静态的“⏳ 数据加载中”文字，且在 `main.js` 执行历史记录扫描时缺乏反馈。引入进度条能显著降低用户的焦虑感。

### 目标
1.  在 `templates.js` 中添加进度条覆盖层的 HTML 结构。
2.  在 `style.css` 中实现进度条的视觉样式。
3.  在 `renderer.js` 中添加更新进度和显示/隐藏覆盖层的方法。
4.  在 `main.js` 的历史扫描逻辑中插入进度报告。
5.  在 `refreshView` 控制器中集成进度反馈。

### 基本原理
我们将在 UI 顶层添加一个绝对定位的 `overlay`。通过 `renderer` 暴露 `showProgress(current, total, text)` 方法，业务逻辑（如 `main.js` 中的循环或 `analysis.js` 中的扫描）可以实时更新 UI。为了保证性能，进度更新将通过 `requestAnimationFrame` 或简单的计数采样来避免过度频繁的 DOM 操作。

### 标签
#intent/build #flow/ready #priority/high 
#comp/ui #concept/ui #scope/ux 
#ai/delegate
#task/domain/ui #task/object/loading-progress #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 更新 UI 结构与样式

首先，我们在 `templates.js` 中添加进度条的 DOM 结构，并在 `style.css` 中定义其样式。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
    <div id="log-archive-view-container" style="flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
        <!-- 记录查看视图 -->
~~~~~
~~~~~javascript.new
    <div id="log-archive-view-container" style="position: relative; flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
        <!-- 进度条覆盖层 -->
        <div id="log-archive-progress-overlay" style="display: none;">
            <div class="progress-card">
                <div id="log-archive-progress-label">处理中...</div>
                <div class="progress-track">
                    <div id="log-archive-progress-bar"></div>
                </div>
                <div id="log-archive-progress-stats">0 / 0</div>
            </div>
        </div>

        <!-- 记录查看视图 -->
~~~~~

~~~~~act
write_file
src/ui/style.css
~~~~~
~~~~~css
/* 进度条覆盖层 */
#log-archive-progress-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.75);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(2px);
}

.progress-card {
    background: #222;
    border: 1px solid #444;
    padding: 20px;
    border-radius: 8px;
    width: 80%;
    max-width: 300px;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}

#log-archive-progress-label {
    margin-bottom: 12px;
    font-size: 0.9em;
    color: var(--color-primary);
}

.progress-track {
    width: 100%;
    height: 8px;
    background: #111;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
}

#log-archive-progress-bar {
    width: 0%;
    height: 100%;
    background: linear-gradient(90deg, var(--color-primary-dim), var(--color-primary));
    transition: width 0.1s ease-out;
}

#log-archive-progress-stats {
    font-size: 0.8em;
    color: var(--color-text-dim);
    font-family: monospace;
}
~~~~~

#### Acts 2: 绑定 DOM 元素与渲染逻辑

在 `dom.js` 中缓存新元素，并在 `renderer.js` 中实现更新逻辑。

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    // Containers
    uiContainer: document.getElementById('log-archive-ui-container'),
    logView: document.getElementById('log-archive-log-view'),
~~~~~
~~~~~javascript.new
    // Containers
    uiContainer: document.getElementById('log-archive-ui-container'),
    progressOverlay: document.getElementById('log-archive-progress-overlay'),
    progressBar: document.getElementById('log-archive-progress-bar'),
    progressLabel: document.getElementById('log-archive-progress-label'),
    progressStats: document.getElementById('log-archive-progress-stats'),
    logView: document.getElementById('log-archive-log-view'),
~~~~~

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
  return {
    render,
    checkStorageUsage: async () => {
~~~~~
~~~~~javascript.new
  return {
    render,
    /**
     * 更新并显示进度条
     */
    updateProgress: (current, total, label) => {
      dom.progressOverlay.style.display = 'flex';
      const percent = total > 0 ? Math.min(100, (current / total) * 100) : 0;
      dom.progressBar.style.width = `${percent}%`;
      dom.progressStats.textContent = `${current} / ${total}`;
      if (label) dom.progressLabel.textContent = label;
    },
    /**
     * 隐藏进度条
     */
    hideProgress: () => {
      dom.progressOverlay.style.display = 'none';
      dom.progressBar.style.width = '0%';
    },
    checkStorageUsage: async () => {
~~~~~

#### Acts 3: 在控制器和业务逻辑中集成

最后，我们将进度条接口暴露给 `main.js`，并在执行历史扫描时调用。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
      uiState.setRecordingStatus(serverName, channelName);
      refreshView();
    },
  };
}
~~~~~
~~~~~javascript.new
      uiState.setRecordingStatus(serverName, channelName);
      refreshView();
    },
    showProgress: (current, total, label) => renderer.updateProgress(current, total, label),
    hideProgress: () => renderer.hideProgress(),
  };
}
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    for (let i = chatLines.length - 1; i >= 0; i--) {
      const element = chatLines[i];
      const timeNode = element.querySelector('.chat-line-timestamp');
~~~~~
~~~~~javascript.new
    const totalLines = chatLines.length;
    for (let i = chatLines.length - 1; i >= 0; i--) {
      if (uiControls && i % 20 === 0) {
        uiControls.showProgress(totalLines - i, totalLines, '正在解析历史记录...');
      }
      const element = chatLines[i];
      const timeNode = element.querySelector('.chat-line-timestamp');
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    try {
      do {
        pendingScan = false;
        await performScanAndMerge();
      } while (pendingScan);
    } finally {
      isScanningHistory = false;
    }
~~~~~
~~~~~javascript.new
    try {
      do {
        pendingScan = false;
        await performScanAndMerge();
      } while (pendingScan);
    } finally {
      isScanningHistory = false;
      if (uiControls) uiControls.hideProgress();
    }
~~~~~

### 下一步建议
- **清理逻辑集成**: 同样的进度反馈可以集成到 `analysis.js` 的 `scanAllDuplicatesAsync` 中，因为扫描数万条记录进行去重也是一个耗时操作。
- **平滑动画**: 考虑使用更细粒度的 `requestAnimationFrame` 来让进度条的移动看起来更丝滑。
- **Indeterminate 状态**: 对于无法预知总数的加载过程（如等待服务器响应），可以添加一个“无线循环”的流光动画效果。
