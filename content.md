经过对模块化重构前后的代码深入对比分析，我发现虽然大部分核心逻辑已成功迁移，但在**响应式更新（Reactivity）**和**界面刷新同步**方面存在几处明显的回归（Regressions）。

以下是详细的分析报告及修复计划。

## [WIP] fix(ui): 修复重构导致的 UI 刷新不及时和计数更新滞后问题

### 错误分析

在 `src/ui.js` 被拆分为 `src/ui/` 目录下的多个模块时，部分原本耦合在函数内部的副作用（Side Effects）被遗漏或被过度的“性能优化”阻断：

1.  **频道计数更新滞后 (`src/ui/renderer.js`)**:
    *   **现象**: 当有新消息进入当前频道时，顶部下拉菜单中的消息总数（如 `Party (10)`) 不再实时更新。
    *   **原因**: `renderer.js` 中的 `render` 函数增加了一个 `if (dom.channelSelector.options.length !== channels.length)` 的判断。只有当频道数量增加时才会重新渲染选项，而当频道内消息数量变化时，该判断为 `false`，导致文本无法更新。

2.  **设置生效不即时 (`src/ui/events.js`)**:
    *   **现象**: 修改“分页大小”后，切换回日志视图发现分页逻辑并未立即按照新设置重新计算。
    *   **原因**: 在旧代码中，`pageSizeInput` 的 `change` 事件会触发 `renderCurrentView()`。但在新代码的 `events.js` 中，仅调用了 `uiState.setPageSize()` 更新状态，缺少了触发渲染的步骤。

3.  **清空操作后的视图残留 (`src/ui/index.js`)**:
    *   **现象**: 点击“清空所有本地存档”并确认后，虽然数据已删除，但主界面的日志显示区域仍然保留着被删除前的消息。
    *   **原因**: `index.js` 中的 `clearAllData` 流程在完成数据重置和存储操作后，未调用 `renderer.render()` 来刷新视图。

4.  **回调对象不完整 (`src/ui/index.js`)**:
    *   **现象**: 在执行“清理重复记录”后的延迟刷新中，传入 `renderer.render` 的回调对象丢失了 `clearAllData` 等方法。
    *   **原因**: `cleanChannelRecords` 内部手动构造了一个临时的回调对象，而没有使用统一定义的 `uiCallbacks`。

### 用户需求
分析模块化拆分中是否存在功能损耗。

### 评论
这是一次非常成功的重构，将 UI 状态、DOM 操作和渲染逻辑清晰分离。上述问题属于重构过程中常见的同步逻辑遗漏，修复难度较低，不会影响整体架构的优雅性。

### 目标
1.  恢复频道下拉菜单消息计数的实时更新。
2.  确保修改设置后 UI 立即反馈。
3.  确保执行数据清理/删除操作后视图立即归零或重置。
4.  统一回调函数传递逻辑。

### 基本原理
通过在 `events.js` 和 `index.js` 的状态修改操作后显式调用渲染函数，并移除 `renderer.js` 中阻碍文本更新的过度优化判断，确保视图与状态（State）始终保持最终一致性。

### 标签
#intent/fix #flow/ready #priority/high #comp/ui #scope/ux #ai/delegate #task/domain/ui #task/object/ui-module #task/action/fix #task/state/begin

---

### Script

#### Acts 1: 修复频道选择器更新逻辑

移除 `renderer.js` 中限制下拉菜单更新的条件判断，确保每次渲染时选项中的消息计数都是准确的。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    // Update channel selector
    const channels = Object.keys(appState);
    if (dom.channelSelector.options.length !== channels.length) {
      dom.channelSelector.innerHTML = '';
      if (channels.length === 0) {
        dom.channelSelector.innerHTML = '<option>无记录</option>';
      } else {
        for (const ch of channels) {
          const opt = document.createElement('option');
          opt.value = ch;
          opt.textContent = `${ch} (${appState[ch].length})`;
          dom.channelSelector.appendChild(opt);
        }
        if (selectedChannel && channels.includes(selectedChannel)) {
          dom.channelSelector.value = selectedChannel;
        }
      }
    }
~~~~~
~~~~~javascript.new
    // Update channel selector
    const channels = Object.keys(appState);
    const prevValue = dom.channelSelector.value;
    dom.channelSelector.innerHTML = '';
    if (channels.length === 0) {
      dom.channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${appState[ch].length})`;
        dom.channelSelector.appendChild(opt);
      }
      if (channels.includes(prevValue)) {
        dom.channelSelector.value = prevValue;
      }
    }
~~~~~

#### Acts 2: 修复设置变更后的即时渲染

在 `events.js` 中，确保修改配置项后能立即触发 UI 刷新。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  // --- Config view actions ---
  dom.selfNameInput.addEventListener('change', () => uiState.setSelfName(dom.selfNameInput.value));
  dom.pageSizeInput.addEventListener('change', () => uiState.setPageSize(dom.pageSizeInput.value));

  dom.cleanButton.addEventListener('click', () => {
~~~~~
~~~~~javascript.new
  // --- Config view actions ---
  dom.selfNameInput.addEventListener('change', () => uiState.setSelfName(dom.selfNameInput.value));
  dom.pageSizeInput.addEventListener('change', () => {
    uiState.setPageSize(dom.pageSizeInput.value);
    fullRender();
  });

  dom.cleanButton.addEventListener('click', () => {
~~~~~

#### Acts 3: 修复清空数据后的 UI 同步

在 `index.js` 中，修复 `clearAllData` 后的渲染缺失，并重构 `cleanChannelRecords` 以使用完整的回调对象。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
      appState[channel] = cleanedRecords;
      }
      appCallbacks.saveMessagesToStorage(appState);
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        renderer.render(appState, {
          ...appCallbacks,
          cleanChannelRecords,
          copyAllData,
          downloadAllData,
        }); // Re-render to update button
      }, 2000);
    }
  };

  const clearAllData = () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      localStorage.removeItem(STORAGE_KEY_V5); // 使用常量
      for (const key of Object.keys(appState)) {
        delete appState[key];
      }
      appCallbacks.scanAndMergeHistory(); // This will repopulate appState
      appCallbacks.saveMessagesToStorage(appState);
    }
  };
~~~~~
~~~~~javascript.new
      appState[channel] = cleanedRecords;
      }
      appCallbacks.saveMessagesToStorage(appState);
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        renderer.render(appState, uiCallbacks); // Re-render to update button
      }, 2000);
    }
  };

  const clearAllData = () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      localStorage.removeItem(STORAGE_KEY_V5); // 使用常量
      for (const key of Object.keys(appState)) {
        delete appState[key];
      }
      appCallbacks.scanAndMergeHistory(); // This will repopulate appState
      appCallbacks.saveMessagesToStorage(appState);
      renderer.render(appState, uiCallbacks);
    }
  };
~~~~~

### 下一步建议

完成这些修复后，UI 的模块化拆分将达到与原单文件实现完全一致的行为表现。

接下来建议：
- **引入观察者模式**: 目前 UI 模块严重依赖 `main.js` 手动调用 `updateUI`。未来可以考虑让 `appState` 变成响应式对象，或者在 `state.js` 中实现简单的事件通知机制，使 UI 能根据数据变化自动重绘。
- **Lint 检查**: 执行 `npm run check` 确保新拆分的模块符合 Biome 的规范。
