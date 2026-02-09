Excellent. We have successfully laid the architectural groundwork. Now, we will implement the core pagination logic, which will directly address the performance issues by rendering the message log in manageable chunks.

This plan introduces a local state object to the UI, adds pagination controls, and modifies the rendering pipeline to display only a slice of the total messages.

## [WIP] feat(ui): implement pagination state and message slicing

### 用户需求
在重构后的 UI 架构上，实现分页显示功能，包括 UI 控件、状态管理和消息切片渲染，以解决大量消息导致的性能瓶颈。

### 评论
这是对前期重构工作的直接回报。通过引入一个简单的 `uiState` 对象，我们可以让 UI 的渲染行为变得可预测且高效。用户将不再经历打开数万条消息时可能出现的冻结现象，这极大地提升了用户体验。

### 目标
1.  在 `src/templates.js` 中添加分页控制器的 HTML 结构。
2.  在 `src/ui.js` 中引入 `uiState` 对象来管理当前页码和页面大小。
3.  修改 `displayChatLog` 函数，使其根据 `uiState` 对消息数组进行切片 (`slice`)。
4.  为新的分页按钮绑定事件监听器，使其能够更新 `uiState` 并触发重新渲染。
5.  确保在切换频道或视图时，分页状态能被正确重置和更新。

### 基本原理
我们将以一个 `uiState` 对象作为 UI 渲染的“唯一事实来源”。任何交互（如点击“下一页”）都只修改这个状态对象，然后调用一个统一的渲染函数。该函数会根据 `uiState` 计算出当前页需要显示的数据范围，对完整的消息数组进行切片，最后将这个小得多的数据子集渲染到 `textarea` 中。

### 标签
#intent/build #flow/ready #priority/high 
#comp/ui #concept/ui #concept/state #scope/ux #scope/core 
#ai/instruct 
#task/domain/ui #task/object/ui-refactor-pagination #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 更新模板以包含分页控件

首先，我们在 `templates.js` 中加入分页的 UI 元素。

~~~~~act
patch_file
src/templates.js
~~~~~
~~~~~javascript.old
            <button id="log-archive-close-button" class="log-archive-ui-button">关闭</button>
        </div>
    </div>
    <textarea id="log-archive-ui-log-display" readonly></textarea>
`;
~~~~~
~~~~~javascript.new
            <button id="log-archive-close-button" class="log-archive-ui-button">关闭</button>
        </div>
    </div>
    <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
        <button id="page-first" class="log-archive-ui-button">« 第一页</button>
        <button id="page-prev" class="log-archive-ui-button">‹ 上一页</button>
        <span id="page-info" style="font-weight: bold; color: #a0c8ff;"></span>
        <button id="page-next" class="log-archive-ui-button">下一页 ›</button>
        <button id="page-last" class="log-archive-ui-button">最后一页 »</button>
    </div>
    <textarea id="log-archive-ui-log-display" readonly style="margin-top: 10px;"></textarea>
`;
~~~~~

#### Acts 2: 在 `ui.js` 中引入状态管理和分页逻辑

现在，我们对 `ui.js` 进行核心改造，引入 `uiState` 并实现切片渲染。

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  const {
    scanAndMergeHistory,
    saveMessagesToStorage,
    cleanChannelRecords,
    detectTotalDuplicates,
    deactivateLogger,
  } = callbacks;

  let isUIPaused = false;

  const container = document.createElement('div');
~~~~~
~~~~~javascript.new
  const {
    scanAndMergeHistory,
    saveMessagesToStorage,
    cleanChannelRecords,
    detectTotalDuplicates,
    deactivateLogger,
  } = callbacks;

  const uiState = {
    currentPage: 1,
    pageSize: 1000,
    totalPages: 1,
    viewMode: 'log', // 'log' or 'stats'
  };
  let isUIPaused = false;

  const container = document.createElement('div');
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  const statsButton = document.getElementById('log-archive-stats-button');
  const pauseButton = document.getElementById('log-archive-pause-button');
  const cleanButton = document.getElementById('log-archive-clean-button');

  let isStatsViewActive = false;

  selfNameInput.value = localStorage.getItem(SELF_NAME_KEY) || '';
~~~~~
~~~~~javascript.new
  const statsButton = document.getElementById('log-archive-stats-button');
  const pauseButton = document.getElementById('log-archive-pause-button');
  const cleanButton = document.getElementById('log-archive-clean-button');
  // Pagination elements
  const paginationControls = document.getElementById('log-archive-ui-pagination-controls');
  const pageFirstBtn = document.getElementById('page-first');
  const pagePrevBtn = document.getElementById('page-prev');
  const pageNextBtn = document.getElementById('page-next');
  const pageLastBtn = document.getElementById('page-last');
  const pageInfoSpan = document.getElementById('page-info');

  selfNameInput.value = localStorage.getItem(SELF_NAME_KEY) || '';
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  // --- UI Rendering ---
  function displayChatLog(messages, channelName) {
    updateTextareaAndPreserveSelection(() => {
      logDisplay.value =
        messages && messages.length > 0
          ? messages.map(formatMessageForDisplay).join('\n')
          : `--- 在频道 [${channelName}] 中没有记录 ---`;
    });
  }
~~~~~
~~~~~javascript.new
  // --- UI Rendering ---
  function updatePaginationControls() {
    pageInfoSpan.textContent = `第 ${uiState.currentPage} / ${uiState.totalPages} 页`;
    pageFirstBtn.disabled = uiState.currentPage === 1;
    pagePrevBtn.disabled = uiState.currentPage === 1;
    pageNextBtn.disabled = uiState.currentPage === uiState.totalPages;
    pageLastBtn.disabled = uiState.currentPage === uiState.totalPages;
  }

  function displayChatLog(messages, channelName) {
    uiState.totalPages = Math.max(1, Math.ceil(messages.length / uiState.pageSize));
    if (uiState.currentPage > uiState.totalPages) {
      uiState.currentPage = uiState.totalPages;
    }

    const startIndex = (uiState.currentPage - 1) * uiState.pageSize;
    const endIndex = startIndex + uiState.pageSize;
    const paginatedMessages = messages.slice(startIndex, endIndex);

    updateTextareaAndPreserveSelection(() => {
      logDisplay.value =
        paginatedMessages.length > 0
          ? paginatedMessages.map(formatMessageForDisplay).join('\n')
          : `--- 在频道 [${channelName}] 中没有记录 ---`;
    });
    updatePaginationControls();
  }
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  function renderCurrentView() {
    const selectedChannel = channelSelector.value;
    const messages = inMemoryChatState[selectedChannel] || [];
    if (isStatsViewActive) {
      displayStatistics(messages, selectedChannel);
    } else {
      displayChatLog(messages, selectedChannel);
    }
  }
~~~~~
~~~~~javascript.new
  function renderCurrentView() {
    const selectedChannel = channelSelector.value;
    const messages = inMemoryChatState[selectedChannel] || [];

    if (uiState.viewMode === 'stats') {
      paginationControls.style.display = 'none';
      displayStatistics(messages, selectedChannel);
    } else {
      paginationControls.style.display = 'flex';
      displayChatLog(messages, selectedChannel);
    }
  }
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  closeButton.addEventListener('click', () => {
    uiContainer.style.display = 'none';
  });
  channelSelector.addEventListener('change', () => renderCurrentView());
  refreshButton.addEventListener('click', () => {
~~~~~
~~~~~javascript.new
  closeButton.addEventListener('click', () => {
    uiContainer.style.display = 'none';
  });
  channelSelector.addEventListener('change', () => {
    uiState.currentPage = 1;
    renderCurrentView();
  });
  refreshButton.addEventListener('click', () => {
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  statsButton.addEventListener('click', () => {
    isStatsViewActive = !isStatsViewActive;
    statsButton.classList.toggle('active', isStatsViewActive);
    statsButton.textContent = isStatsViewActive ? '查看记录' : '查看统计';
    renderCurrentView();
  });
  copyButton.addEventListener('click', () => {
~~~~~
~~~~~javascript.new
  statsButton.addEventListener('click', () => {
    uiState.viewMode = uiState.viewMode === 'log' ? 'stats' : 'log';
    const isStats = uiState.viewMode === 'stats';
    statsButton.classList.toggle('active', isStats);
    statsButton.textContent = isStats ? '查看记录' : '查看统计';
    renderCurrentView();
  });

  // Pagination listeners
  pageFirstBtn.addEventListener('click', () => {
    if (uiState.currentPage > 1) {
      uiState.currentPage = 1;
      renderCurrentView();
    }
  });
  pagePrevBtn.addEventListener('click', () => {
    if (uiState.currentPage > 1) {
      uiState.currentPage--;
      renderCurrentView();
    }
  });
  pageNextBtn.addEventListener('click', () => {
    if (uiState.currentPage < uiState.totalPages) {
      uiState.currentPage++;
      renderCurrentView();
    }
  });
  pageLastBtn.addEventListener('click', () => {
    if (uiState.currentPage < uiState.totalPages) {
      uiState.currentPage = uiState.totalPages;
      renderCurrentView();
    }
  });

  copyButton.addEventListener('click', () => {
~~~~~


~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
      scanAndMergeHistory();
      saveMessagesToStorage(inMemoryChatState);
      isStatsViewActive = false;
      statsButton.classList.remove('active');
      statsButton.textContent = '查看统计';
      updateUI();
    }
~~~~~
~~~~~javascript.new
      scanAndMergeHistory();
      saveMessagesToStorage(inMemoryChatState);
      uiState.viewMode = 'log';
      statsButton.classList.remove('active');
      statsButton.textContent = '查看统计';
      updateUI();
    }
~~~~~

### 下一步建议
我们已经成功实现了分页功能的核心。现在，这个重构和功能实现的工作单元已经完成。

我建议创建一个 `[COMMIT]` 计划，将这次重构（模板分离、分析逻辑提取）和新功能（分页）作为一个整体提交。这将标志着我们解决了最初提出的性能问题。
