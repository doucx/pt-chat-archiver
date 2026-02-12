好的，这个反馈非常专业。使用非阻塞的按钮状态反馈替代模态对话框（alert）不仅能降低用户的操作焦虑，也符合现代 Web UI 的设计直觉（如您代码中已有的“复制成功”和“保存成功”的处理逻辑）。

## [WIP] style: 优化导入成功的交互反馈

### 用户需求
将导入成功后的 `alert` 弹窗移除，改为在导入按钮上显示临时的“导入成功”状态，以减少用户的操作压力并避免“刷新页面”带来的误导。

### 评论
模态对话框（alert）会强制中断用户心流，且“界面即将刷新”确实容易被误解为整个浏览器标签页的重载，从而让用户担心当前未保存的状态丢失。通过按钮文字反馈（Text Feedback）是一种更轻量、优雅的交互方式。

### 目标
1.  移除 `src/ui/index.js` 中导入成功后的 `alert` 调用。
2.  实现导入按钮的临时文字切换逻辑（显示“✅ 导入成功” 2秒后恢复）。

### 基本原理
利用之前在 `createUI` 中已经获取到的 `dom` 引用，直接修改 `dom.importButton.textContent`。这与项目中“手动保存”和“复制内容”按钮的反馈机制保持了高度一致性。

### 标签
#intent/tune #flow/ready #priority/low #comp/ui #scope/ux #ai/refine #task/domain/ui #task/object/import-feature #task/action/tune #task/state/continue

---

### Script

#### Acts 1: 优化导入成功后的反馈逻辑

修改 `src/ui/index.js` 中的 `importAllData` 函数，替换 `alert` 为按钮文字反馈。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
            // 3. 持久化
            await appCallbacks.saveMessagesToStorage(appState);

            alert('存档导入成功！界面即将刷新。');
            renderer.render(appState, uiCallbacks);
          }
~~~~~
~~~~~javascript.new
            // 3. 持久化
            await appCallbacks.saveMessagesToStorage(appState);

            const originalText = dom.importButton.textContent;
            dom.importButton.textContent = '✅ 导入成功';
            setTimeout(() => {
              dom.importButton.textContent = originalText;
            }, 2000);

            renderer.render(appState, uiCallbacks);
          }
~~~~~

### 下一步建议
- **统一反馈时长**: 目前项目中不同按钮的 `setTimeout` 回复时间（1500ms 或 2000ms）不尽相同，未来可以考虑在 `constants.js` 中定义一个 `UI_FEEDBACK_DURATION` 常量进行统一管理。
- **导入后的视图定位**: 导入后 UI 会重新渲染，如果导入的数据非常多，建议默认将视图定位到第一个服务器的第一个频道，或者保持在当前用户正在查看的服务器上。目前 `renderer.render` 已经能较好地处理基础展示。
