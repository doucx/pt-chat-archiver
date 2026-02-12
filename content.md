## [WIP] fix: 修复导入功能的文件选择器及状态同步问题

### 错误分析
在上一版实现中，`importAllData` 的触发逻辑存在两个严重问题：
1.  **浏览器安全策略拦截**: 在 `dom.importButton` 的点击事件中，先执行了阻塞式的 `confirm()` 弹窗，导致后续的 `input.click()` 丢失了“用户激活”状态，从而被浏览器拦截，无法弹出文件选择器。
2.  **状态分离 (State Detachment)**: `createUI` 内部虽然更新了局部的 `appState`，但没有提供回调去更新 `main.js` 中的全局 `inMemoryChatState` 引用。这会导致导入后，新接收到的 WebSocket 消息仍然被写入旧的状态对象中，造成数据丢失和 UI 不同步。

### 用户需求
用户点击“导入”应立即弹出文件选择框，选择文件后需进行格式校验和高风险操作确认，最后正确覆盖并同步所有状态。

### 评论
为了解决文件选择器弹出的问题，我们将流程调整为“先选文件，后确认”。为了解决状态分离，我们需要在 `main.js` 向 UI 传递一个 `replaceState` 回调。

### 目标
1.  修改 `main.js`，传入 `replaceState` 回调以支持状态的全量替换。
2.  重构 `src/ui/index.js` 中的 `importAllData`，移除阻塞，实现正确的文件读取、校验、确认和状态更新流程。
3.  简化 `src/ui/events.js`，移除事件处理器中的 `confirm`，直接调用导入函数。

### 基本原理
利用 HTML5 `input[type=file]` 的标准行为，在用户点击按钮时同步触发选择器。在 `FileReader` 读取并解析 JSON 成功后，再弹出确认框。如果用户确认，则同时更新 UI 内部状态和 `main.js` 的全局引用，并持久化到存储。

### 标签
#intent/fix #flow/ready #priority/high #comp/ui #comp/storage #scope/ux #ai/instruct #task/domain/ui #task/object/import-feature #task/action/bug-fix #task/state/continue

---

### Script

#### Acts 1: 在 main.js 中添加状态替换回调

我们需要确保 `inMemoryChatState` 变量能被外部更新，否则导入后的新数据与实时接收的新消息将写入不同的对象。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    // 2. 加载状态与初始化 UI
    inMemoryChatState = await storageManager.loadAllV6();
    uiControls = await createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage: (state) => storageManager.saveAllV6(state), // Pass a compatible function
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
      manualSave: performAutoSave,
      onAutoSaveIntervalChange: startAutoSaveTimer,
    });
~~~~~
~~~~~javascript.new
    // 2. 加载状态与初始化 UI
    inMemoryChatState = await storageManager.loadAllV6();
    uiControls = await createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage: (state) => storageManager.saveAllV6(state), // Pass a compatible function
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
      manualSave: performAutoSave,
      onAutoSaveIntervalChange: startAutoSaveTimer,
      replaceState: (newState) => {
        inMemoryChatState = newState;
      },
    });
~~~~~

#### Acts 2: 重构 UI 层的导入逻辑

修正 `importAllData`，采用“先点击 input，后确认”的模式，并正确调用 `replaceState`。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const importAllData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);

          // 基础结构校验
          if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
            throw new Error('无效的存档格式：根节点必须是一个对象。');
          }

          // 执行保存
          await appCallbacks.saveMessagesToStorage(importedData);

          // 更新内存状态
          appState = importedData;

          alert('存档导入成功！界面即将刷新。');
          renderer.render(appState, uiCallbacks);
        } catch (err) {
          console.error('[Archiver] Import failed:', err);
          alert(`导入失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };

    input.click();
  };
~~~~~
~~~~~javascript.new
  const importAllData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);

          // 基础结构校验
          if (
            typeof importedData !== 'object' ||
            importedData === null ||
            Array.isArray(importedData)
          ) {
            throw new Error('无效的存档格式：根节点必须是一个对象。');
          }

          const serverCount = Object.keys(importedData).length;
          const warning = `准备导入文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n【严重警告】\n此操作将完全清空并覆盖当前浏览器的所有本地存档！\n此操作不可撤销。\n\n确定要继续吗？`;

          if (confirm(warning)) {
            // 1. 更新全局状态引用 (main.js)
            if (appCallbacks.replaceState) {
              appCallbacks.replaceState(importedData);
            }
            // 2. 更新 UI 本地状态
            appState = importedData;

            // 3. 持久化
            await appCallbacks.saveMessagesToStorage(appState);

            alert('存档导入成功！界面即将刷新。');
            renderer.render(appState, uiCallbacks);
          }
        } catch (err) {
          console.error('[Archiver] Import failed:', err);
          alert(`导入失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };

    // 必须直接响应用户操作触发 click，不能有 alert/confirm 阻断
    input.click();
  };
~~~~~

#### Acts 3: 移除事件绑定中的阻塞代码

移除 `dom.importButton` 点击事件中的 `confirm`，确保点击事件能直接传导给 `input.click()`。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.importButton.addEventListener('click', () => {
    const warning = '【警告】导入操作将全量覆盖当前数据库中的所有聊天记录。建议在操作前先执行“下载备份”。\n\n确定要继续吗？';
    if (confirm(warning)) {
      if (confirm('最后确认：点击确定后，现有的所有本地存档将被选中的文件内容彻底替换。')) {
        callbacks.importAllData();
      }
    }
  });
~~~~~
~~~~~javascript.new
  dom.importButton.addEventListener('click', () => {
    callbacks.importAllData();
  });
~~~~~

### 下一步建议
测试导入功能在不同网络环境和数据量下的表现。如果导入的数据量非常大（例如几十 MB 的 JSON），`JSON.parse` 可能会导致主线程短暂卡顿，未来可以考虑将其放入 Web Worker 中处理。
