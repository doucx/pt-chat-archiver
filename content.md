这是一个非常棒的建议。目前 UI 的颜色散落在各个 CSS 类甚至 JavaScript 模板的行内样式中，缺乏统一的视觉语言，也不利于后期维护。

我将通过引入 **CSS 变量 (Custom Properties)** 来重构整个色彩体系。我们将定义一套核心调色板（基于 PonyTown 的深色风格），并确保所有组件都引用这些变量。

## [WIP] style: 统一 UI 色彩体系并引入 CSS 变量

### 用户需求
统一 UI 的视觉风格，解决颜色不一致的问题，并提高样式的可维护性。

### 评论
使用 CSS 变量是现代 Web 开发的标准做法。它不仅能确保视觉的一致性，还允许我们未来轻松地实现“皮肤”切换（如明亮模式或自定义主题）。

### 目标
1.  在 `src/style.css` 中定义全局色彩变量（Primary, Success, Warning, Danger, Background 等）。
2.  重构 `src/style.css`，移除硬编码的十六进制颜色值。
3.  清理 `src/templates.js` 中的行内颜色样式，将其移至 CSS。
4.  确保所有交互状态（Hover, Active, Paused）遵循统一的亮度变化规则。

### 基本原理
我们将建立一个以 `#8af` (PonyTown 标志性的浅蓝色) 为核心的调色板。背景将使用深灰色 (`#1a2026`)，并辅以半透明层级，以保持与游戏界面的和谐。通过 CSS 变量，我们可以一次性修改全局的主题色。

### 标签
#intent/tune #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #ai/refine #task/domain/ui #task/object/theme-system #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 定义色彩变量并重构 `src/style.css`

我们将引入变量集，并重写现有的样式规则。

~~~~~act
write_file
src/style.css
~~~~~
~~~~~css
/* 核心色彩体系 */
#log-archive-ui-container {
  --color-primary: #8af;
  --color-primary-hover: #a0c8ff;
  --color-bg: rgba(26, 32, 38, 0.95);
  --color-surface: #2a3036;
  --color-surface-hover: #363d44;
  --color-border: #4a545e;
  --color-text: #e0e0e0;
  --color-text-dim: #a0a0a0;
  
  --color-success: #3a8c54;
  --color-success-hover: #4da669;
  --color-warning: #c89632;
  --color-warning-hover: #e0aa40;
  --color-danger: #8c3a3a;
  --color-danger-hover: #a64d4d;
  --color-info: #3a6a8c;
  --color-info-hover: #4d86a6;

  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 70vw;
  height: 80vh;
  background-color: var(--color-bg);
  border: 2px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.7);
  z-index: 99999;
  display: none;
  flex-direction: column;
  padding: 15px;
  font-family: monospace;
  color: var(--color-text);
}

#log-archive-ui-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 10px;
}

#log-archive-ui-header h2 {
  margin: 0;
  font-size: 1.2em;
  color: var(--color-primary);
  flex-shrink: 0;
  margin-right: 15px;
}

#log-archive-ui-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

#log-archive-ui-log-display {
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 0.9em;
  padding: 10px;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-y: auto;
  flex-grow: 1;
  resize: none;
  border-radius: 4px;
}

/* 按钮通用样式 */
.log-archive-ui-button,
#log-archive-self-name-input {
  padding: 8px 12px;
  background-color: var(--color-surface);
  color: #fff;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9em;
}

.log-archive-ui-button:hover {
  background-color: var(--color-surface-hover);
  border-color: var(--color-text-dim);
}

.log-archive-ui-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 特定语义按钮 */
#log-archive-pause-button { background-color: var(--color-success); }
#log-archive-pause-button:hover { background-color: var(--color-success-hover); }
#log-archive-pause-button.paused { background-color: var(--color-warning); }
#log-archive-pause-button.paused:hover { background-color: var(--color-warning-hover); }

#log-archive-stats-button.active { background-color: var(--color-success); }
#log-archive-settings-button.active { background-color: var(--color-warning); border-color: var(--color-warning-hover); }

#log-archive-clear-button { background-color: var(--color-danger); }
#log-archive-clear-button:hover { background-color: var(--color-danger-hover); }

#log-archive-download-button { background-color: var(--color-info); }
#log-archive-download-button:hover { background-color: var(--color-info-hover); }

#log-archive-clean-button.active {
  background-color: var(--color-warning);
  font-weight: bold;
}

/* 分页与信息 */
.info-text-primary { color: var(--color-primary-hover); font-weight: bold; }
.info-text-dim { color: var(--color-text-dim); font-size: 0.85em; }

/* 设置视图 */
.config-section {
  padding: 10px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.config-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-group label {
  font-weight: bold;
  color: var(--color-primary);
  font-size: 0.9em;
}

.config-group input {
  padding: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: white;
  border-radius: 4px;
}

/* 切换按钮 */
#log-archive-ui-toggle-button {
  position: fixed;
  bottom: 50px;
  right: 20px;
  width: 50px;
  height: 50px;
  background-color: var(--color-primary);
  color: #111;
  border-radius: 50%;
  border: none;
  font-size: 24px;
  line-height: 50px;
  text-align: center;
  cursor: pointer;
  z-index: 99998;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
  transition: transform 0.2s;
}

#log-archive-ui-toggle-button:hover {
  transform: scale(1.1);
  background-color: var(--color-primary-hover);
}

#log-archive-storage-warning {
  color: #ffcc00;
  font-weight: bold;
  font-size: 0.9em;
  margin-left: 20px;
  flex-shrink: 0;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}
~~~~~

#### Acts 2: 移除 `src/templates.js` 中的行内颜色

我们将使用在 Act 1 中定义的新 CSS 类。

~~~~~act
patch_file
src/templates.js
~~~~~
~~~~~javascript.old
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
                <button id="page-first" class="log-archive-ui-button">«</button>
                <button id="page-prev" class="log-archive-ui-button">‹</button>
                <span id="page-info" style="font-weight: bold; color: #a0c8ff;"></span>
                <button id="page-next" class="log-archive-ui-button">›</button>
                <button id="page-last" class="log-archive-ui-button">»</button>
            </div>
            <textarea id="log-archive-ui-log-display" readonly style="margin-top: 10px; flex-grow: 1;"></textarea>
        </div>

        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" style="color: #a0c8ff; font-size: 0.85em; margin-bottom: 5px;"></div>
                <div class="config-actions">
~~~~~
~~~~~javascript.new
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
                <button id="page-first" class="log-archive-ui-button">«</button>
                <button id="page-prev" class="log-archive-ui-button">‹</button>
                <span id="page-info" class="info-text-primary"></span>
                <button id="page-next" class="log-archive-ui-button">›</button>
                <button id="page-last" class="log-archive-ui-button">»</button>
            </div>
            <textarea id="log-archive-ui-log-display" readonly style="margin-top: 10px; flex-grow: 1;"></textarea>
        </div>

        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" class="info-text-dim" style="margin-bottom: 5px;"></div>
                <div class="config-actions">
~~~~~

### 下一步建议

1.  **视觉校对**: 打开脚本界面，检查按钮的 Hover 状态和 Active 状态是否符合预期。
2.  **清理 lint**: 建议同时应用上一回合中的 Biome lint 修复，以确保代码库在视觉和逻辑上都达到了最佳状态。
3.  **响应式优化**: 目前宽度固定为 `70vw`，可以考虑针对更窄的屏幕（如手机端 PonyTown）做一些微调。
