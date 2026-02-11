这是一个非常考究的交互设计。我们将 `>>` 按钮从单纯的“跳转”进化为“吸附”逻辑：点击它会进入“追踪最新消息”模式，在该模式下，视图不仅保持在最后一页，还会锁定在最底端。只有当用户手动向上滚动或切换页面时，这种吸附状态才会解除。

## [WIP] feat: 优化 ">>" 按钮为“吸附到底部”模式

### 用户需求
1.  **吸附逻辑**: 修改 `>>` 按钮，使其在最后一页时依然可点击。点击后进入“自动跟随最新消息”状态。
2.  **禁用条件**: 仅当已经处于“自动跟随”状态时，`>>` 按钮才设为不可点击（Disabled）。
3.  **状态解除**: 当用户执行其他分页操作（前翻、第一页等）或手动向上滚动日志区域时，自动解除跟随状态。
4.  **非默认行为**: 自动跟随不会默认开启，必须由用户通过点击 `>>` 激活。

### 评论
这种设计将 `>>` 按钮变成了一个带有状态的“锚点”。它解决了用户在查看活跃频道时，需要不断手动下拉以获取新消息的痛点。同时，通过用户的主动点击来触发，完美避开了“自动滚动可能干扰阅读历史”的问题。

### 目标
1.  在 `ui/state.js` 中添加 `isLockedToBottom` 状态。
2.  在 `ui/renderer.js` 中，若处于锁定状态，渲染后自动滚动到底部。
3.  更新 `ui/renderer.js` 中 `pageLastBtn` 的禁用逻辑。
4.  在 `ui/events.js` 中，为 `>>` 绑定锁定逻辑，并为其他按钮绑定解锁逻辑。
5.  在 `ui/events.js` 中为日志区域添加 `scroll` 监听，实现“向上滚动即解锁”。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/pagination #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 更新 UI 状态管理器

在 `src/ui/state.js` 中添加锁定状态。

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~python.old
    autoFollowServer: true,
    lastSavedTime: null,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
  };
~~~~~
~~~~~python.new
    autoFollowServer: true,
    lastSavedTime: null,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isLockedToBottom: false, // 是否锁定在最底端跟随新消息
    isUIPaused: false,
    activeServer: null, // 当前物理所在的服务器
    viewingServer: null, // 当前正在查看的存档服务器
  };
~~~~~
~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~python.old
    togglePause: () => {
      state.isUIPaused = !state.isUIPaused;
      return state.isUIPaused;
    },
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
~~~~~
~~~~~python.new
    togglePause: () => {
      state.isUIPaused = !state.isUIPaused;
      return state.isUIPaused;
    },
    setLockedToBottom: (locked) => {
      state.isLockedToBottom = !!locked;
    },
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
~~~~~

#### Acts 2: 增强渲染逻辑与吸附行为

修改 `src/ui/renderer.js` 以支持自动吸附和新的按钮禁用状态。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~python.old
  // --- Main Render Logic ---
  const render = (appState, callbacks) => {
    const { viewMode, currentPage, pageSize, viewingServer, activeServer } = uiState.getState();

    // 1. 更新服务器选择器 (v6 特有)
~~~~~
~~~~~python.new
  // --- Main Render Logic ---
  const render = (appState, callbacks) => {
    const { viewMode, currentPage, pageSize, viewingServer, activeServer, isLockedToBottom } =
      uiState.getState();

    // 1. 更新服务器选择器 (v6 特有)
~~~~~
~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~python.old
      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value =
          paginatedMessages.length > 0
            ? paginatedMessages.map(formatMessageForDisplay).join('\n')
            : `--- 在频道 [${selectedChannel}] 中没有记录 ---`;
      });

      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
~~~~~
~~~~~python.new
      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value =
          paginatedMessages.length > 0
            ? paginatedMessages.map(formatMessageForDisplay).join('\n')
            : `--- 在频道 [${selectedChannel}] 中没有记录 ---`;
      });

      // 如果处于吸附模式，确保滚动到底部
      if (isLockedToBottom && currentPage === totalPages) {
        dom.logDisplay.scrollTop = dom.logDisplay.scrollHeight;
      }

      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
~~~~~
~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~python.old
      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = dom.pageLastBtn.disabled = isLast;
    }
  };
~~~~~
~~~~~python.new
      dom.pageInfoSpan.textContent = `${currentPage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = isLast;
      // 最后一页按钮仅在“已处于吸附模式”且“已经在最后一页”时才禁用
      dom.pageLastBtn.disabled = isLast && isLockedToBottom;
    }
  };
~~~~~

#### Acts 3: 绑定事件监听与状态解除逻辑

在 `src/ui/events.js` 中管理模式的切换。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~python.old
  // --- Pagination ---
  dom.pageFirstBtn.addEventListener('click', () => {
    uiState.setPage(1);
    fullRender();
  });
  dom.pagePrevBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().currentPage - 1);
    fullRender();
  });
  dom.pageNextBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().currentPage + 1);
    fullRender();
  });
  dom.pageLastBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().totalPages);
    fullRender();
    // 自动滚动到最底端以查看最新记录
    dom.logDisplay.scrollTop = dom.logDisplay.scrollHeight;
  });
~~~~~
~~~~~python.new
  // --- Pagination ---
  dom.pageFirstBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(1);
    fullRender();
  });
  dom.pagePrevBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(uiState.getState().currentPage - 1);
    fullRender();
  });
  dom.pageNextBtn.addEventListener('click', () => {
    uiState.setLockedToBottom(false);
    uiState.setPage(uiState.getState().currentPage + 1);
    fullRender();
  });
  dom.pageLastBtn.addEventListener('click', () => {
    uiState.setPage(uiState.getState().totalPages);
    uiState.setLockedToBottom(true);
    fullRender();
  });
~~~~~
~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~python.old
      dom.pauseButton.classList.add('paused');
    }
  });

  // --- Pagination ---
~~~~~
~~~~~python.new
      dom.pauseButton.classList.add('paused');
    }
  });

  // 手动向上滚动时解除“吸附到底部”模式
  dom.logDisplay.addEventListener('scroll', () => {
    const { isLockedToBottom } = uiState.getState();
    if (isLockedToBottom) {
      const threshold = 10; // 容差像素
      const isAtBottom =
        dom.logDisplay.scrollHeight - dom.logDisplay.scrollTop - dom.logDisplay.clientHeight <
        threshold;
      if (!isAtBottom) {
        uiState.setLockedToBottom(false);
        // 刷新渲染以更新按钮状态（>> 会从禁用变为启用）
        fullRender();
      }
    }
  });

  // --- Pagination ---
~~~~~

### 下一步建议

交互逻辑已升级。现在：
- 用户点击 `>>` 会跳转到最后一页并**锁定**底部。
- 在锁定状态下，新消息进入会导致 `textarea` 自动滚动（因为 `updateUI` 调用了 `render`，而 `render` 检测到了 `isLockedToBottom`）。
- 只要用户用鼠标滚轮向上拨动一点，锁定就会解除，`>>` 按钮重新变为可点击状态，方便用户随时一键跳回底端。

建议下一步：
- **UI 反馈**: 可以在锁定状态时给 `>>` 按钮添加一个微小的视觉反馈（例如边框加亮或颜色微调），让用户清楚地知道当前处于“跟随模式”。
- **性能观察**: 频繁的 `scroll` 监听可能会有微小的性能开销，虽然在 `textarea` 上通常不是问题，但可以观察在大数据量下的表现。
