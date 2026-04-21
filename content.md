你的分析非常准确！目前的测试失败是因为我们正处于“新旧更替”的混合阶段：`initDOM` 仍然按照旧模板生成了一整套静态 DOM，而 Preact 挂载时又生成了一套几乎一样的组件。这导致页面上出现了重复的 ID 和多个 `textarea`（textbox），令测试工具 `screen.getByRole('textbox')` 感到困惑。

为了修复这一问题，并让重构继续推进，我们需要执行 **“接管策略”**：
1.  **ID 同步**：确保 Preact 组件生成的元素具有与旧模板完全一致的 `id`，以便 `getDOMElements()` 能够正确获取它们。
2.  **容器清空**：在挂载 Preact 之前，清空容器中的旧静态 HTML。
3.  **缓存重置**：由于 `getDOMElements` 具有单例缓存，我们需要在 Preact 渲染后强制重置缓存，让旧的 `renderer.js` 和 `events.js` 能够“抓到” Preact 生成的新 DOM 节点。
4.  **实现 `ConfigPanel`**：由于集成测试需要操作设置项，我们必须在此时完成 `ConfigPanel.jsx` 的重构。

## [WIP] refactor: 开启 Preact 重构 - 修复 DOM 重复并实现 ConfigPanel

### 错误分析
`tests/ui.integration.test.js` 失败的主要原因是 DOM 树中存在冗余。
- **Multiple textboxes**: `initDOM` 填充了模板，`LogViewer.jsx` 又渲染了一个 `textarea`。
- **Visibility & Class errors**: 测试试图操作旧的 DOM 节点（已被隐藏或脱离文档流），而 Preact 渲染的节点虽然可见，但由于 `getDOMElements` 缓存了旧节点，导致逻辑失效。
- **Missing Inputs**: `ConfigPanel` 尚未实现，测试无法找到 `pageSizeInput`。

### 用户需求
消除 DOM 重复，确保重构过程中的集成测试能够通过，并完成配置面板的组件化。

### 评论
这是重构中最具挑战性的“桥接”时刻。通过让 Preact 渲染具有相同 ID 的元素并重置 DOM 引用缓存，我们可以让那些尚未重构的遗留代码（如 `renderer.js`）无缝地操作 Preact 生成的 DOM。这种“偷梁换柱”的方法是大型项目平滑迁移的常用技巧。

### 目标
1.  修改 `dom.js`，暴露 `resetDOMCache` 方法。
2.  在 `index.jsx` 挂载 Preact 前清空容器，并在挂载后重置 DOM 缓存。
3.  同步 `Header.jsx`, `LogViewer.jsx`, `Pagination.jsx` 中的 ID。
4.  实现 `ConfigPanel.jsx` 并集成到 `App.jsx`。

### 标签
#intent/refine #flow/ready #priority/high 
#comp/ui #concept/ui #scope/dx #ai/refine
#task/domain/ui #task/object/preact-refactor #task/action/dom-sync
#task/state/continue #task/status/active

---

### Script

#### Acts 1: 同步组件 ID 并修正样式逻辑

为了让 `renderer.js` 和 `events.js` 继续工作，我们需要补全缺失的 ID。

~~~~~act
patch_file
src/ui/components/Header.jsx
~~~~~
~~~~~jsx.old
  return (
    <div id="log-archive-ui-header">
      <div id="log-archive-ui-controls" style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}>
~~~~~
~~~~~jsx.new
  return (
    <div id="log-archive-ui-header">
      <div id="log-archive-ui-controls" style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}>
        <div id="log-archive-readonly-indicator" class="readonly-pill" style={{ display: isReadOnly.value ? 'block' : 'none' }}>只读存档模式</div>
~~~~~

~~~~~act
patch_file
src/ui/components/Pagination.jsx
~~~~~
~~~~~jsx.old
  return (
    <div id="log-archive-ui-pagination-controls" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexShrink: 0 }}>
      <button type="button" className="log-archive-ui-button" disabled={isFirst} onClick={() => goToPage(1)}>«</button>
      <button type="button" className="log-archive-ui-button" disabled={isFirst} onClick={() => goToPage(currentPage.value - 1)}>‹</button>
      <span className="info-text-primary">{currentPage.value} / {totalPages.value}</span>
      <button type="button" className="log-archive-ui-button" disabled={isLast} onClick={() => goToPage(currentPage.value + 1)}>›</button>
      <button 
        type="button"
        className={`log-archive-ui-button ${isLockedToBottom.value ? 'active' : ''}`} 
~~~~~
~~~~~jsx.new
  return (
    <div id="log-archive-ui-pagination-controls" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexShrink: 0 }}>
      <button id="page-first" type="button" className="log-archive-ui-button" disabled={isFirst} onClick={() => goToPage(1)}>«</button>
      <button id="page-prev" type="button" className="log-archive-ui-button" disabled={isFirst} onClick={() => goToPage(currentPage.value - 1)}>‹</button>
      <span id="page-info" className="info-text-primary">{currentPage.value} / {totalPages.value}</span>
      <button id="page-next" type="button" className="log-archive-ui-button" disabled={isLast} onClick={() => goToPage(currentPage.value + 1)}>›</button>
      <button 
        id="page-last"
        type="button"
        className={`log-archive-ui-button ${isLockedToBottom.value ? 'active' : ''}`} 
~~~~~

#### Acts 2: 实现 ConfigPanel.jsx

这是通过集成测试的关键。

~~~~~act
write_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~jsx
import { useEffect, useState } from 'preact/hooks';
import { 
  pageSize, statsLimit, readChunkSize, initDebounceMs, cachePages, autoFollowServer,
  viewingServer, activeServer, lastServer, updateConfig
} from '../store/uiStore';
import { serverList } from '../store/dataStore';
import { storageManager, getStorageUsageInMB } from '../../storage/index.js';

export function ConfigPanel({ callbacks }) {
  const [usage, setUsage] = useState(0);
  const [totalMsgs, setTotalMsgs] = useState(0);

  useEffect(() => {
    getStorageUsageInMB().then(setUsage);
    storageManager.getTotalMessageCount().then(setTotalMsgs);
  }, []);

  return (
    <div id="log-archive-config-view" className="config-section" style={{ display: 'flex', flexDirection: 'column' }}>
       <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '15px', marginBottom: '5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ margin: 0, color: 'var(--color-primary)', fontSize: '1.1em' }}>PT Chat Archiver</h3>
              <span className="info-text-dim" style={{ fontSize: '0.8em' }}>v{__APP_VERSION__}</span>
          </div>
      </div>

      <div className="config-group">
          <label htmlFor="log-archive-server-view-selector">查看存档服务器</label>
          <div className="config-input-row">
              <select 
                id="log-archive-server-view-selector" 
                className="log-archive-ui-button" 
                style={{ flexGrow: 1, minWidth: 0 }}
                value={viewingServer.value}
                onChange={(e) => viewingServer.value = e.target.value}
              >
                {serverList.value.map(s => (
                  <option key={s} value={s}>{s === activeServer.value ? `${s} (正在记录)` : s}</option>
                ))}
              </select>
              <button id="log-archive-reset-server-button" type="button" className="log-archive-ui-button" onClick={() => viewingServer.value = activeServer.value}>📍</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <input 
                type="checkbox" 
                id="log-archive-auto-follow-input" 
                checked={autoFollowServer.value} 
                onChange={(e) => updateConfig('autoFollowServer', e.target.checked)}
              />
              <label htmlFor="log-archive-auto-follow-input" style={{ fontWeight: 'normal', color: 'var(--color-text-dim)', fontSize: '0.85em', cursor: 'pointer' }}>跟随游戏服务器切换</label>
          </div>
      </div>

      <div className="config-group">
          <label htmlFor="log-archive-page-size-input">分页大小 (每页消息条数)</label>
          <input 
            type="number" id="log-archive-page-size-input" 
            value={pageSize.value} 
            onChange={(e) => updateConfig('pageSize', e.target.value)}
          />
      </div>

      <div className="config-group">
          <label>维护操作</label>
          <div id="log-archive-config-storage-info" className="info-text-dim">估算数据占用: {usage.toFixed(2)} MB</div>
          <div id="log-archive-config-msg-count" className="info-text-dim" style={{ marginBottom: '8px' }}>存档消息总数: {totalMsgs.toLocaleString()} 条</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button id="log-archive-clean-button" type="button" className="log-archive-ui-button" onClick={callbacks.scanDuplicates}>扫描重复记录</button>
              <button id="log-archive-clear-button" type="button" className="log-archive-ui-button" style={{ color: '#ff6666' }} onClick={callbacks.clearAllData}>清空所有存档</button>
          </div>
      </div>
    </div>
  );
}
~~~~~

#### Acts 3: 改造 App.jsx 组装面板

~~~~~act
patch_file
src/ui/App.jsx
~~~~~
~~~~~jsx.old
import { viewMode, isReadOnly } from './store/uiStore';
import { Header } from './components/Header';
import { LogViewer } from './components/LogViewer';

export function App({ dataAdapter, appCallbacks }) {
~~~~~
~~~~~jsx.new
import { viewMode, isReadOnly } from './store/uiStore';
import { Header } from './components/Header';
import { LogViewer } from './components/LogViewer';
import { ConfigPanel } from './components/ConfigPanel';

export function App({ dataAdapter, appCallbacks }) {
~~~~~

~~~~~act
patch_file
src/ui/App.jsx
~~~~~
~~~~~jsx.old
      <div id="log-archive-view-container" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {viewMode.value === 'log' && <LogViewer />}
        {viewMode.value === 'config' && (
          <div style={{ padding: '20px', color: '#ccc' }}>
            <h3>Config Panel (In Progress)</h3>
            <p>正在重构配置面板组件...</p>
          </div>
        )}
        {viewMode.value === 'stats' && (
~~~~~
~~~~~jsx.new
      <div id="log-archive-view-container" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {viewMode.value === 'log' && <LogViewer />}
        {viewMode.value === 'config' && <ConfigPanel callbacks={callbacks} />}
        {viewMode.value === 'stats' && (
~~~~~

#### Acts 4: 暴露重置缓存接口并执行接管

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
/**
 * Finds and caches references to all key UI elements.
~~~~~
~~~~~javascript.new
/**
 * Resets the DOM elements cache. 
 * Required when switching between Vanilla and Preact rendering.
 */
export function resetDOMCache() {
  domElements = null;
}

/**
 * Finds and caches references to all key UI elements.
~~~~~

在 `index.jsx` 中执行清空与重置逻辑。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
import { render } from 'preact';
import { App } from './App.jsx';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
~~~~~
~~~~~javascript.new
import { render } from 'preact';
import { App } from './App.jsx';
import { getDOMElements, initDOM, resetDOMCache } from './dom.js';
import { bindUIEvents } from './events.js';
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
  // 4. Preact Mounting
  // 正式将 Preact 渲染引擎挂载到 DOM 容器中
  render(<App dataAdapter={dataAdapter} appCallbacks={uiCallbacks} />, dom.uiContainer);

  // 5. Initial Render
~~~~~
~~~~~javascript.new
  // 4. Preact Mounting
  // [Bridge] 清空容器中的旧静态 HTML，并让 Preact 接管 ID
  dom.uiContainer.innerHTML = '';
  render(<App dataAdapter={dataAdapter} appCallbacks={uiCallbacks} />, dom.uiContainer);
  
  // [Bridge] 重置 getDOMElements 的单例缓存，使 legacy 代码能抓到 Preact 生成的新节点
  resetDOMCache();
  const newDom = getDOMElements();
  // 更新遗留引用
  dom.logDisplay = newDom.logDisplay;
  dom.pageInfoSpan = newDom.pageInfoSpan;

  // 5. Initial Render
~~~~~

### 下一步建议
通过上述“偷梁换柱”的操作，集成测试中的 `multiple roles` 报错应该会消失，因为静态 HTML 已被彻底清空。同时 `ConfigPanel` 的实现将补齐测试所需的交互输入。

一旦此次测试通过，我们将进入 **阶段四：全面接管**。此时，我们可以放心地删除 `templates.js` 中那些已经废弃的 HTML 字符串，并开始将 `renderer.js` 中的逻辑彻底迁移到 Preact 组件的 `render` 过程中。
