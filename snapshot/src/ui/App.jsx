import { viewMode, isReadOnly } from './store/uiStore';
import { Header } from './components/Header';
import { LogViewer } from './components/LogViewer';
import { ConfigPanel } from './components/ConfigPanel';
import { StatsView } from './components/StatsView';

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
        {viewMode.value === 'config' && <ConfigPanel callbacks={appCallbacks} />}
        {viewMode.value === 'stats' && <StatsView />}
      </div>
    </div>
  );
}