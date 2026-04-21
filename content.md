收到，编译错误和规范告警是因为：
1. Vite 默认对 `.js` 后缀的文件不进行 JSX 转换，所以 `index.js` 内部渲染 `<App />` 时发生了解析失败 (Parse failure)。我们需要将它更名为 `index.jsx`。
2. Biome Linter 进行着严格的 React A11y (可访问性) 和 Hook 依赖检查。我们需要明确指定按钮的 `type="button"`，并提取出 `useMemo/useEffect` 依赖数组中的属性读取操作。

让我们立即解决这些问题，确保基础建筑稳固！

## [WIP] fix: 修复 Preact JSX 编译错误与 Biome Linter 告警

### 错误分析
1. **RollupError (Parse failure)**: 发生在 `src/ui/index.js` 中。原因是该文件包含 JSX 语法 (`<App />`)，但在 Vite (配合 `@preact/preset-vite`) 的默认配置下，只有后缀为 `.jsx` 或 `.tsx` 的文件才会被送入 JSX 编译器处理。
2. **Biome Linter**: 
    - `lint/a11y/useButtonType`: `<button>` 元素未指定 `type`，在表单中可能会触发意外提交，React 应用中推荐显式写明 `type="button"`。
    - `lint/suspicious/noAssignInExpressions`: 不允许在箭头函数的返回值表达式中进行赋值，如 `onClick={() => a = b}`，应改为块级作用域 `onClick={() => { a = b; }}`。
    - `lint/correctness/useExhaustiveDependencies`: `useMemo` 和 `useEffect` 的依赖数组中不推荐直接传入 `obj.value` 这样的表达式。虽然在 Preact Signals 中这是常见的获取值方式，但我们可以通过预先解构为变量来同时满足 Signals 和 Linter 的规范要求。

### 用户需求
修复构建失败的错误和所有 Linter 报错，让测试重新通过。

### 评论
将包含组件装载逻辑的文件改为 `.jsx` 后缀是规范的做法。同时满足严格的 Linter 有助于提升项目的长期可维护性，特别是在接下来的大规模组件拆分阶段。

### 目标
1. 将 `src/ui/index.js` 重命名为 `src/ui/index.jsx`。
2. 更新主入口和测试文件中引用 `createUI` 的路径。
3. 修正所有新建组件 (`Header`, `Pagination`, `LogViewer`) 中的规范问题。

### 基本原理
文件改名能激活 Vite 的 JSX 转换流水线。在 Hook 中将 `.value` 解构为普通 `const` 变量再传入依赖数组，既满足了 ESLint/Biome 的静态分析需求，又能维持 Preact 的响应性。

### 标签
#intent/fix #flow/ready #priority/high 
#comp/build #comp/ui #scope/dx 
#ai/delegate
#task/domain/ui #task/object/preact-refactor #task/action/bug-fix 
#task/state/continue #task/status/active

---

### Script

#### Acts 1: 重命名装载器并更新引用

我们需要将 `index.js` 改为 `index.jsx`。

~~~~~act
move_file
src/ui/index.js
src/ui/index.jsx
~~~~~

更新引用该文件的其它模块。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import { getSyntheticChannelName, mergeAndDeduplicateMessages } from './state.js';
import { storageManager } from './storage/index.js';
import { createUI } from './ui/index.js';
import { generateULID } from './utils.js';
~~~~~
~~~~~javascript.new
import { getSyntheticChannelName, mergeAndDeduplicateMessages } from './state.js';
import { storageManager } from './storage/index.js';
import { createUI } from './ui/index.jsx';
import { generateULID } from './utils.js';
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.js';
import '@testing-library/jest-dom/vitest';
~~~~~
~~~~~javascript.new
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
import '@testing-library/jest-dom/vitest';
~~~~~

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.js';
import '@testing-library/jest-dom/vitest';
~~~~~
~~~~~javascript.new
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.jsx';
import '@testing-library/jest-dom/vitest';
~~~~~

#### Acts 2: 修复组件 Linter 告警

逐一修复组件中的 `button` 类型、内联赋值和 Hook 依赖告警。

~~~~~act
patch_file
src/ui/components/Header.jsx
~~~~~
~~~~~jsx.old
        <select 
          id="log-archive-channel-selector" 
          className="log-archive-ui-button" 
          style={{ flexGrow: 1, marginRight: '10px' }}
          value={selectedChannel.value}
          onChange={(e) => selectedChannel.value = e.target.value}
        >
~~~~~
~~~~~jsx.new
        <select 
          id="log-archive-channel-selector" 
          className="log-archive-ui-button" 
          style={{ flexGrow: 1, marginRight: '10px' }}
          value={selectedChannel.value}
          onChange={(e) => { selectedChannel.value = e.target.value; }}
        >
~~~~~

~~~~~act
patch_file
src/ui/components/Header.jsx
~~~~~
~~~~~jsx.old
        <div style={{ display: 'flex', gap: '5px' }}>
          {isReadOnly.value && (
            <button className="log-archive-ui-button" title="回到正在记录的服务器" onClick={handleResetServer}>📍</button>
          )}
          {!isReadOnly.value && (
            <button 
              className={`log-archive-ui-button ${isUIPaused.value ? 'paused' : ''}`} 
              title="暂停/恢复录制"
              onClick={() => isUIPaused.value = !isUIPaused.value}
            >
              {isUIPaused.value ? '▶️ ' : '⏸️ '}
            </button>
          )}
          <button 
            className={`log-archive-ui-button ${viewMode.value === 'stats' ? 'active' : ''}`} 
            title="数据统计"
            onClick={() => handleToggleView('stats')}
          >
            {viewMode.value === 'stats' ? '📜' : '📊'}
          </button>
          <button 
            className={`log-archive-ui-button ${viewMode.value === 'config' ? 'active' : ''}`} 
            title="设置"
            onClick={() => handleToggleView('config')}
          >
            ⚙️
          </button>
          <button className="log-archive-ui-button" title="复制当前页内容" onClick={callbacks.copyCurrentPage}>📋</button>
          <button className="log-archive-ui-button" title="关闭界面" onClick={callbacks.closeUI}>❌</button>
        </div>
~~~~~
~~~~~jsx.new
        <div style={{ display: 'flex', gap: '5px' }}>
          {isReadOnly.value && (
            <button type="button" className="log-archive-ui-button" title="回到正在记录的服务器" onClick={handleResetServer}>📍</button>
          )}
          {!isReadOnly.value && (
            <button 
              type="button"
              className={`log-archive-ui-button ${isUIPaused.value ? 'paused' : ''}`} 
              title="暂停/恢复录制"
              onClick={() => { isUIPaused.value = !isUIPaused.value; }}
            >
              {isUIPaused.value ? '▶️ ' : '⏸️ '}
            </button>
          )}
          <button 
            type="button"
            className={`log-archive-ui-button ${viewMode.value === 'stats' ? 'active' : ''}`} 
            title="数据统计"
            onClick={() => handleToggleView('stats')}
          >
            {viewMode.value === 'stats' ? '📜' : '📊'}
          </button>
          <button 
            type="button"
            className={`log-archive-ui-button ${viewMode.value === 'config' ? 'active' : ''}`} 
            title="设置"
            onClick={() => handleToggleView('config')}
          >
            ⚙️
          </button>
          <button type="button" className="log-archive-ui-button" title="复制当前页内容" onClick={callbacks.copyCurrentPage}>📋</button>
          <button type="button" className="log-archive-ui-button" title="关闭界面" onClick={callbacks.closeUI}>❌</button>
        </div>
~~~~~

~~~~~act
patch_file
src/ui/components/Pagination.jsx
~~~~~
~~~~~jsx.old
  return (
    <div id="log-archive-ui-pagination-controls" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexShrink: 0 }}>
      <button className="log-archive-ui-button" disabled={isFirst} onClick={() => goToPage(1)}>«</button>
      <button className="log-archive-ui-button" disabled={isFirst} onClick={() => goToPage(currentPage.value - 1)}>‹</button>
      <span className="info-text-primary">{currentPage.value} / {totalPages.value}</span>
      <button className="log-archive-ui-button" disabled={isLast} onClick={() => goToPage(currentPage.value + 1)}>›</button>
      <button 
        className={`log-archive-ui-button ${isLockedToBottom.value ? 'active' : ''}`} 
        disabled={isLast && isLockedToBottom.value}
        onClick={toggleLock}
        title={isLockedToBottom.value ? "已锁定末尾" : "跳转并锁定到末尾"}
      >
        »
      </button>
    </div>
  );
~~~~~
~~~~~jsx.new
  return (
    <div id="log-archive-ui-pagination-controls" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexShrink: 0 }}>
      <button type="button" className="log-archive-ui-button" disabled={isFirst} onClick={() => goToPage(1)}>«</button>
      <button type="button" className="log-archive-ui-button" disabled={isFirst} onClick={() => goToPage(currentPage.value - 1)}>‹</button>
      <span className="info-text-primary">{currentPage.value} / {totalPages.value}</span>
      <button type="button" className="log-archive-ui-button" disabled={isLast} onClick={() => goToPage(currentPage.value + 1)}>›</button>
      <button 
        type="button"
        className={`log-archive-ui-button ${isLockedToBottom.value ? 'active' : ''}`} 
        disabled={isLast && isLockedToBottom.value}
        onClick={toggleLock}
        title={isLockedToBottom.value ? "已锁定末尾" : "跳转并锁定到末尾"}
      >
        »
      </button>
    </div>
  );
~~~~~

~~~~~act
patch_file
src/ui/components/LogViewer.jsx
~~~~~
~~~~~jsx.old
export function LogViewer() {
  const textareaRef = useRef(null);

  // 性能优化：仅当消息列表改变时才重新生成巨型字符串
  const displayText = useMemo(() => {
    if (currentMessages.value.length === 0) {
      return UI_MESSAGES.NO_RECORDS_IN_CHANNEL.replace('%s', selectedChannel.value);
    }
    return currentMessages.value.map(formatMessageForDisplay).join('\n');
  }, [currentMessages.value, selectedChannel.value]);

  // 自动滚动处理
  useEffect(() => {
    if (isLockedToBottom.value && currentPage.value === totalPages.value && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [displayText, isLockedToBottom.value, currentPage.value, totalPages.value]);

  const handleScroll = (e) => {
~~~~~
~~~~~jsx.new
export function LogViewer() {
  const textareaRef = useRef(null);

  const msgs = currentMessages.value;
  const channel = selectedChannel.value;

  // 性能优化：仅当消息列表改变时才重新生成巨型字符串
  const displayText = useMemo(() => {
    if (msgs.length === 0) {
      return UI_MESSAGES.NO_RECORDS_IN_CHANNEL.replace('%s', channel);
    }
    return msgs.map(formatMessageForDisplay).join('\n');
  }, [msgs, channel]);

  const locked = isLockedToBottom.value;
  const curPage = currentPage.value;
  const totPages = totalPages.value;

  // 自动滚动处理
  useEffect(() => {
    if (locked && curPage === totPages && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [displayText, locked, curPage, totPages]);

  const handleScroll = (e) => {
~~~~~

### 下一步建议
通过这几个补丁，Vite 的解析器应当能重新点亮，并且 Biome 也会变绿！
待测试通过后，我们将回归主线，继续拆解剩下的巨无霸：`ConfigPanel.jsx` 和 `StatsView.jsx`。请继续运行检查！
