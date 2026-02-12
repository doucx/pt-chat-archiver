好的，我将为您在设置面板中添加“导入存档”功能。

由于导入操作会全量覆盖当前数据库中的所有聊天记录，我会按照您的要求加入明显的警告确认弹窗，并使用原生的文件选择器来处理 JSON 文件的读取。

## [WIP] feat: 为设置面板添加数据导入功能

### 用户需求
用户需要一个“导入”选项，能够将之前导出的 JSON 格式存档重新加载到插件中，并要求在执行此高风险操作（覆盖现有数据）时显示警告。

### 评论
这是一个重要的闭环功能。目前插件已经有了“导出”和“下载”功能，增加“导入”功能可以方便用户在不同浏览器或清理浏览器缓存后恢复数据。鉴于当前存储架构（V7/IndexedDB）的 `saveAllV6` 采用的是“清空并重写”策略，这天然符合“覆盖导入”的语义。

### 目标
1.  在 `templates.js` 的设置视图中新增“导入存档”按钮。
2.  在 `dom.js` 中添加该按钮的引用。
3.  在 `ui/index.js` 中实现文件读取、JSON 解析及数据覆盖逻辑。
4.  在 `events.js` 中绑定按钮事件并集成 `confirm` 警告逻辑。

### 基本原理
我们将利用 HTML5 的 `FileReader` API 来读取用户选择的本地文件。在保存数据前，通过 `window.confirm` 弹出两次确认，以确保用户意识到当前存档将被完全覆盖。导入成功后，我们将更新内存中的 `appState` 并触发 UI 重新渲染。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #comp/storage #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/import-feature #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 修改 UI 模板，添加导入按钮

在“导出 JSON”按钮旁边添加一个“导入存档”按钮。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
                    <div class="config-actions" style="display: flex; gap: 10px;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">清理重复</button>
                        <button id="log-archive-copy-all-button" class="log-archive-ui-button" style="flex-grow: 1;">导出 JSON</button>
                        <button id="log-archive-download-button" class="log-archive-ui-button" style="flex-grow: 1;">下载备份</button>
                    </div>
~~~~~
~~~~~javascript.new
                    <div class="config-actions" style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">清理重复</button>
                        <button id="log-archive-copy-all-button" class="log-archive-ui-button" style="flex-grow: 1;">导出 JSON</button>
                        <button id="log-archive-import-button" class="log-archive-ui-button" style="flex-grow: 1;">📥 导入存档</button>
                        <button id="log-archive-download-button" class="log-archive-ui-button" style="flex-grow: 1;">下载备份</button>
                    </div>
~~~~~

#### Acts 2: 更新 DOM 引用

在 `dom.js` 中增加对新按钮的获取。

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    copyAllButton: document.getElementById('log-archive-copy-all-button'),
    clearButton: document.getElementById('log-archive-clear-button'),

    // Pagination Controls
~~~~~
~~~~~javascript.new
    copyAllButton: document.getElementById('log-archive-copy-all-button'),
    importButton: document.getElementById('log-archive-import-button'),
    clearButton: document.getElementById('log-archive-clear-button'),

    // Pagination Controls
~~~~~

#### Acts 3: 在 UI 模块中实现导入逻辑

在 `src/ui/index.js` 中添加 `importAllData` 函数，负责文件处理和状态更新。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const copyAllData = () => {
    const messages = JSON.stringify(appState, null, 2);
    navigator.clipboard.writeText(messages);
  };

  const cleanChannelRecords = async () => {
~~~~~
~~~~~javascript.new
  const copyAllData = () => {
    const messages = JSON.stringify(appState, null, 2);
    navigator.clipboard.writeText(messages);
  };

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

  const cleanChannelRecords = async () => {
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    downloadAllData,
    deleteV6Backup,
  };
~~~~~
~~~~~javascript.new
    cleanChannelRecords,
    clearAllData,
    copyAllData,
    importAllData,
    downloadAllData,
    deleteV6Backup,
  };
~~~~~

#### Acts 4: 绑定事件并添加警告确认

在 `events.js` 中绑定点击事件，并加入警告对话框。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.copyAllButton.addEventListener('click', () => {
    callbacks.copyAllData();
    const originalText = dom.copyAllButton.textContent;
    dom.copyAllButton.textContent = '已复制 JSON!';
    setTimeout(() => {
      dom.copyAllButton.textContent = originalText;
    }, 1500);
  });

  dom.downloadButton.addEventListener('click', () => callbacks.downloadAllData());
~~~~~
~~~~~javascript.new
  dom.copyAllButton.addEventListener('click', () => {
    callbacks.copyAllData();
    const originalText = dom.copyAllButton.textContent;
    dom.copyAllButton.textContent = '已复制 JSON!';
    setTimeout(() => {
      dom.copyAllButton.textContent = originalText;
    }, 1500);
  });

  dom.importButton.addEventListener('click', () => {
    const warning = '【警告】导入操作将全量覆盖当前数据库中的所有聊天记录。建议在操作前先执行“下载备份”。\n\n确定要继续吗？';
    if (confirm(warning)) {
      if (confirm('最后确认：点击确定后，现有的所有本地存档将被选中的文件内容彻底替换。')) {
        callbacks.importAllData();
      }
    }
  });

  dom.downloadButton.addEventListener('click', () => callbacks.downloadAllData());
~~~~~

### 下一步建议
- **数据校验增强**: 目前仅检查了根节点是否为对象。建议后续可以增加对 `server -> channel -> message[]` 结构的深度校验，防止用户意外导入格式不兼容的 JSON 导致 UI 渲染错误。
- **合并导入选项**: 未来可以考虑提供一个“增量导入”选项，通过消息 ID 对比来合并存档，而不是简单的全量覆盖。
