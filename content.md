## [WIP] feat: 开启 Preact 重构 - 阶段三：原子组件拆分

### 用户需求
按照路线图，将 `templates.js` 中的巨型 HTML 字符串解构为声明式的 Preact 组件。重点实现 `Header`、`Pagination` 和 `LogViewer` 核心组件，并让它们直接驱动已建立的 `Signals`。

### 评论
从命令式 DOM 字符串跳转到声明式 JSX 是重构中最具获得感的一步。我们现在可以利用 Preact 的条件渲染逻辑（如 `{isReadOnly && <Indicator />}`）来替代之前繁琐的 `classList.toggle` 和 `style.display` 手动修改。由于底层状态已经通过 Signals 响应式化，这些组件在编写时几乎不需要考虑“何时更新”的问题，只需关注“如何展示”。

### 目标
1.  创建 `Header.jsx`：包含频道选择、录制状态展示及顶部控制按钮组。
2.  创建 `Pagination.jsx`：实现分页导航逻辑，支持锁定到底部模式。
3.  创建 `LogViewer.jsx`：封装日志显示区域，处理复杂的 `textarea` 自动滚动和只读提示逻辑。
4.  组装 `App.jsx`：将上述组件缝合进主应用容器。

### 基本原理
我们将 `templates.js` 中的静态 HTML 块转化为接收 `Props` 或直接订阅 `Store` 的活性组件。
*   **Header**：通过 `selectedChannel.value` 同步下拉框状态。
*   **Pagination**：根据 `isLockedToBottom.value` 的变化自动切换按钮的高亮类名。
*   **LogViewer**：利用 `useMemo` 缓存格式化后的日志字符串，避免每次状态微调都重新 join 几千行文本，从而保证性能。

### 标签
#intent/build #flow/ready #priority/high 
#comp/ui #concept/ui #concept/parser #scope/ux 
#ai/delegate
#task/domain/ui #task/object/preact-refactor #task/action/component-split 
#task/state/continue #task/status/active

---

### Script

#### Acts 1: 创建顶部 Header 组件

`Header` 负责全局导航和录制状态的实时反馈。

~~~~~act
write_file
src/ui/components/Header.jsx
~~~~~
~~~~~jsx
import { viewMode, isUIPaused, activeServer, recordedChannel, viewingServer, selectedChannel, lastServer, isReadOnly } from '../store/uiStore';
import { channelList, channelCounts } from '../store/dataStore';

export function Header({ callbacks }) {
  const handleToggleView = (mode) => {
    viewMode.value = viewMode.value === mode ? 'log' : mode;
  };

  const handleResetServer = () => {
    if (activeServer.value) viewingServer.value = activeServer.value;
  };

  const renderStatus = () => {
    if (!activeServer.value) {
      return (
        <span style={{ fontSize: '0.85em' }}>
          等待进入游戏... {lastServer.value && <span className="info-text-dim">(上个: {lastServer.value})</span>}
        </span>
      );
    }
    if (!isReadOnly.value) {
      return (
        <span style={{ color: 'var(--color-primary-hover)', fontSize: '0.85em' }}>
          ✅ 正在记录: {activeServer.value}{recordedChannel.value ? `::${recordedChannel.value}` : ''}
        </span>
      );
    }
    return (
      <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85em' }}>
        📖 浏览存档: {viewingServer.value}
      </span>
    );
  };

  return (
    <div id="log-archive-ui-header">
      <div id="log-archive-ui-controls" style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}>
        <select 
          id="log-archive-channel-selector" 
          className="log-archive-ui-button" 
          style={{ flexGrow: 1, marginRight: '10px' }}
          value={selectedChannel.value}
          onChange={(e) => selectedChannel.value = e.target.value}
        >
          {channelList.value.length === 0 ? (
            <option value="">无记录</option>
          ) : (
            channelList.value.map(ch => (
              <option key={ch} value={ch}>{ch} ({channelCounts.value[ch] || 0})</option>
            ))
          )}
        </select>

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
      </div>
      <div id="log-archive-server-status" style={{ marginTop: '5px', textAlign: 'center' }}>
        {renderStatus()}
      </div>
    </div>
  );
}
~~~~~

#### Acts 2: 创建分页导航组件

`Pagination` 组件直接操纵页码 Signal，并根据当前状态自动禁用按钮。

~~~~~act
write_file
src/ui/components/Pagination.jsx
~~~~~
~~~~~jsx
import { currentPage, totalPages, isLockedToBottom } from '../store/uiStore';

export function Pagination() {
  const isFirst = currentPage.value === 1;
  const isLast = currentPage.value === totalPages.value;

  const goToPage = (p) => {
    isLockedToBottom.value = false;
    currentPage.value = Math.max(1, Math.min(p, totalPages.value));
  };

  const toggleLock = () => {
    if (!isLast) {
      currentPage.value = totalPages.value;
    }
    isLockedToBottom.value = !isLockedToBottom.value;
  };

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
}
~~~~~

#### Acts 3: 创建日志显示区域组件

`LogViewer` 包含只读提示和核心文本框。这里我们使用 `useRef` 来接管原有的滚动高度逻辑。

~~~~~act
write_file
src/ui/components/LogViewer.jsx
~~~~~
~~~~~jsx
import { useMemo, useRef, useEffect } from 'preact/hooks';
import { currentMessages } from '../store/dataStore';
import { selectedChannel, isReadOnly, isLockedToBottom, currentPage, totalPages, isUIPaused } from '../store/uiStore';
import { UI_MESSAGES } from '../../constants.js';
import { formatMessageForDisplay } from '../renderer.js';
import { Pagination } from './Pagination';

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
    const el = e.target;
    if (displayText.startsWith('⏳')) return;

    const threshold = 10;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    if (isLockedToBottom.value && !isAtBottom) {
      isLockedToBottom.value = false;
    } else if (!isLockedToBottom.value && isAtBottom && currentPage.value === totalPages.value) {
      isLockedToBottom.value = true;
    }
  };

  const handleMouseDown = () => {
    if (!isUIPaused.value) {
      isUIPaused.value = true;
    }
  };

  return (
    <div id="log-archive-log-view" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {isReadOnly.value && <div className="readonly-pill">只读存档模式</div>}
      <Pagination />
      <textarea 
        ref={textareaRef}
        id="log-archive-ui-log-display" 
        readOnly 
        style={{ marginTop: '10px', flexGrow: 1 }}
        value={displayText}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
~~~~~

#### Acts 4: 组装 App.jsx

最后，我们将各原子组件组装进主架构，并预留 `ConfigPanel` 的位置。

~~~~~act
patch_file
src/ui/App.jsx
~~~~~
~~~~~jsx.old
import { useEffect } from 'preact/hooks';
import { viewMode, isReadOnly } from './store/uiStore';

/**
 * PT Chat Archiver 根组件
 * 负责分发路由和管理全局容器样式
 */
export function App({ dataAdapter, appCallbacks }) {
  return (
    <div className={`log-archive-app-root ${isReadOnly.value ? 'is-readonly' : ''}`}>
      {/* 
          后续将在此处组装组件：
          <Header />
          <ViewContainer>
             {viewMode.value === 'log' && <LogViewer />}
             {viewMode.value === 'config' && <ConfigPanel />}
             {viewMode.value === 'stats' && <StatsView />}
          </ViewContainer>
      */}
      <div style={{ padding: '20px', color: 'white' }}>
        <h2>Preact Engine Ready</h2>
        <p>Current View: {viewMode.value}</p>
        <p>Status: {isReadOnly.value ? 'ReadOnly' : 'Recording'}</p>
        <button onClick={() => viewMode.value = viewMode.value === 'log' ? 'config' : 'log'}>
          Toggle View (Signal Test)
        </button>
      </div>
    </div>
  );
}
~~~~~
~~~~~jsx
import { viewMode, isReadOnly } from './store/uiStore';
import { Header } from './components/Header';
import { LogViewer } from './components/LogViewer';

export function App({ dataAdapter, appCallbacks }) {
  // 定义桥接到 UI 外部的回调
  const callbacks = {
    closeUI: () => {
      const container = document.getElementById('log-archive-ui-container');
      if (container) container.style.display = 'none';
    },
    copyCurrentPage: () => {
      const display = document.getElementById('log-archive-ui-log-display');
      if (display?.value) {
        navigator.clipboard.writeText(display.value);
        // 这里可以添加更优雅的 Preact Toast 反馈
      }
    }
  };

  return (
    <div 
      className={`log-archive-app-root ${isReadOnly.value ? 'is-readonly' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      <Header callbacks={callbacks} />
      
      <div id="log-archive-view-container" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {viewMode.value === 'log' && <LogViewer />}
        {viewMode.value === 'config' && (
          <div style={{ padding: '20px', color: '#ccc' }}>
            <h3>Config Panel (In Progress)</h3>
            <p>正在重构配置面板组件...</p>
          </div>
        )}
        {viewMode.value === 'stats' && (
          <div style={{ padding: '20px', color: '#ccc' }}>
            <h3>Statistics View (In Progress)</h3>
          </div>
        )}
      </div>
    </div>
  );
}
~~~~~

### 下一步建议
我们已经完成了核心查看页面的重构。接下来的任务是：
1.  **实现 `ConfigPanel.jsx`**：这是 `templates.js` 中最臃肿的部分，包含大量的输入框和按钮逻辑。
2.  **实现 `StatsView.jsx`**：将统计报告的文本生成逻辑也迁移为组件。
3.  **全面接管渲染**：在 `index.js` 中将 Preact 挂载到真实的 `#log-archive-ui-container` 中，并开始有计划地删除旧的 `renderer.js` 和 `templates.js`。
