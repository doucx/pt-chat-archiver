这是一个非常好的尝试。将 CSS 移出 JS 是模块化的第一步，这能让你享受到编辑器的语法高亮，同时也让 JS 逻辑更纯粹。

---

## [WIP] refactor: 将 UI 样式提取至独立的 CSS 文件

### 用户需求
将 `src/main.js` 中硬编码在 `GM_addStyle` 里的 CSS 提取到 `src/style.css` 文件中，并通过 `import` 语句引入，利用 Vite 的资源管道自动处理样式注入。

### 评论
使用独立的 CSS 文件不仅能提高代码的可读性，还能利用 Vite 的处理能力。对于油猴脚本，`vite-plugin-monkey` 会自动处理这些 `import`，确保样式在脚本执行时被正确注入。

### 目标
1.  创建 `src/style.css` 并填入原本的 UI 样式。
2.  在 `src/main.js` 顶部引入该 CSS 文件。
3.  移除 `src/main.js` 中不再需要的 `GM_addStyle` 调用。

### 基本原理
Vite 允许通过 `import './style.css'` 的方式引入样式。在油猴插件的上下文中，插件会将这些样式转换成注入逻辑（通常是生成一个 `<style>` 标签或调用 `GM_addStyle`），这使得开发者可以像开发普通网页一样管理样式。

### 标签
#intent/refine #flow/ready #priority/medium #comp/build #concept/ui #scope/dx #ai/instruct #task/domain/ui #task/object/css-extraction #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 创建样式文件

我们将原始脚本中的所有 CSS 提取到独立文件中。

~~~~~act
write_file
src/style.css
~~~~~
~~~~~css
#log-archive-ui-container { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 70vw; height: 80vh; background-color: rgba(0, 0, 0, 0.65); border: 2px solid #5a6673; border-radius: 8px; box-shadow: 0 0 20px rgba(0,0,0,0.5); z-index: 99999; display: none; flex-direction: column; padding: 15px; font-family: monospace; color: #e0e0e0; }
#log-archive-ui-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-shrink: 0; flex-wrap: wrap; gap: 10px; }
#log-archive-ui-header h2 { margin: 0; font-size: 1.2em; color: #8af; flex-shrink: 0; margin-right: 15px; }
#log-archive-ui-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
#log-archive-ui-log-display { width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.2); border: 1px solid #444; color: #ddd; font-size: 0.9em; padding: 10px; white-space: pre-wrap; word-wrap: break-word; overflow-y: auto; flex-grow: 1; resize: none; }
.log-archive-ui-button, #log-archive-self-name-input { padding: 8px 12px; background-color: #4a545e; color: #fff; border: 1px solid #6c7886; border-radius: 4px; cursor: pointer; transition: background-color 0.2s; }
.log-archive-ui-button:hover { background-color: #6c7886; }
#log-archive-self-name-input { cursor: text; background-color: #2a3036; }
#log-archive-refresh-button { background-color: #3a8c54; }
#log-archive-refresh-button:hover { background-color: #4da669; }
#log-archive-pause-button { background-color: #3a8c54; }
#log-archive-pause-button.paused { background-color: #c89632; border-color: #e0aa40; }
#log-archive-pause-button.paused:hover { background-color: #e0aa40; }
#log-archive-clear-button { background-color: #8c3a3a; }
#log-archive-clear-button:hover { background-color: #a64d4d; }
#log-archive-download-button { background-color: #3a6a8c; }
#log-archive-download-button:hover { background-color: #4d86a6; }
#log-archive-clean-button { background-color: #6a6a6a; transition: background-color 0.3s, color 0.3s; }
#log-archive-clean-button.active { background-color: #c88032; border-color: #e09d40; font-weight: bold; color: #fff; }
#log-archive-clean-button.active:hover { background-color: #e09d40; }
#log-archive-stats-button { background-color: #3a8c54; }
#log-archive-stats-button:hover { background-color: #7b65a0; }
#log-archive-stats-button.active { background-color: #3a8c54; border-color: #4da669; color: #fff; }
#log-archive-ui-toggle-button { position: fixed; bottom: 50px; right: 20px; width: 50px; height: 50px; background-color: #8af; color: #111; border-radius: 50%; border: none; font-size: 24px; line-height: 50px; text-align: center; cursor: pointer; z-index: 99998; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
#log-archive-storage-warning { color: #ffcc00; font-weight: bold; font-size: 0.9em; margin-left: 20px; flex-shrink: 0; }
~~~~~

#### Acts 2: 修改主入口以引入 CSS 并清理样式注入代码

我们在 `main.js` 顶部引入新创建的 CSS，并删除 `createUI` 函数中的 `GM_addStyle` 代码块。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
(function() {
  'use strict';

  // --- 全局配置与状态 ---
~~~~~
~~~~~javascript.new
import './style.css';

(function() {
  'use strict';

  // --- 全局配置与状态 ---
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
   * 用户交互界面 (UI) 模块
   * =================================================================
   */  function createUI() {
    GM_addStyle(`
            #log-archive-ui-container { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 70vw; height: 80vh; background-color: rgba(0, 0, 0, 0.65); border: 2px solid #5a6673; border-radius: 8px; box-shadow: 0 0 20px rgba(0,0,0,0.5); z-index: 99999; display: none; flex-direction: column; padding: 15px; font-family: monospace; color: #e0e0e0; }
            #log-archive-ui-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-shrink: 0; flex-wrap: wrap; gap: 10px; }
            #log-archive-ui-header h2 { margin: 0; font-size: 1.2em; color: #8af; flex-shrink: 0; margin-right: 15px; }
            #log-archive-ui-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
            #log-archive-ui-log-display { width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.2); border: 1px solid #444; color: #ddd; font-size: 0.9em; padding: 10px; white-space: pre-wrap; word-wrap: break-word; overflow-y: auto; flex-grow: 1; resize: none; }
            .log-archive-ui-button, #log-archive-self-name-input { padding: 8px 12px; background-color: #4a545e; color: #fff; border: 1px solid #6c7886; border-radius: 4px; cursor: pointer; transition: background-color 0.2s; }
            .log-archive-ui-button:hover { background-color: #6c7886; }
            #log-archive-self-name-input { cursor: text; background-color: #2a3036; }
            #log-archive-refresh-button { background-color: #3a8c54; }
            #log-archive-refresh-button:hover { background-color: #4da669; }
            #log-archive-pause-button { background-color: #3a8c54; }
            #log-archive-pause-button.paused { background-color: #c89632; border-color: #e0aa40; }
            #log-archive-pause-button.paused:hover { background-color: #e0aa40; }
            #log-archive-clear-button { background-color: #8c3a3a; }
            #log-archive-clear-button:hover { background-color: #a64d4d; }
            #log-archive-download-button { background-color: #3a6a8c; }
            #log-archive-download-button:hover { background-color: #4d86a6; }
            #log-archive-clean-button { background-color: #6a6a6a; transition: background-color 0.3s, color 0.3s; }
            #log-archive-clean-button.active { background-color: #c88032; border-color: #e09d40; font-weight: bold; color: #fff; }
            #log-archive-clean-button.active:hover { background-color: #e09d40; }
            #log-archive-stats-button { background-color: #3a8c54; }
            #log-archive-stats-button:hover { background-color: #7b65a0; }
            #log-archive-stats-button.active { background-color: #3a8c54; border-color: #4da669; color: #fff; }
            #log-archive-ui-toggle-button { position: fixed; bottom: 50px; right: 20px; width: 50px; height: 50px; background-color: #8af; color: #111; border-radius: 50%; border: none; font-size: 24px; line-height: 50px; text-align: center; cursor: pointer; z-index: 99998; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
            #log-archive-storage-warning { color: #ffcc00; font-weight: bold; font-size: 0.9em; margin-left: 20px; flex-shrink: 0; }
        `);

    let isUIPaused = false;
~~~~~
~~~~~javascript.new
   * 用户交互界面 (UI) 模块
   * =================================================================
   */  function createUI() {
    let isUIPaused = false;
~~~~~

### 下一步建议
1.  **验证样式**: 运行 `npm run build` 并检查生成的脚本。你应该能发现 CSS 已经被编译并包含在脚本的顶部。
2.  **JS 逻辑拆分**: 现在样式已经拆分出去了，下一步建议按照之前的计划，将 `constants.js`（常量）和 `utils.js`（通用工具函数）提取出来，让 `main.js` 更关注程序的主流程。

**如果你完成了测试，请告知我，我们可以开始下一步的逻辑拆分。**
