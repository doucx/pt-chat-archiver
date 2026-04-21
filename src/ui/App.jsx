import { ConfigPanel } from './components/ConfigPanel';
import { Header } from './components/Header';
import { LogViewer } from './components/LogViewer';
import { StatsView } from './components/StatsView';
import { isReadOnly, viewMode } from './store/uiStore';

export function App({ dataAdapter, appCallbacks }) {
  // 定义桥接到 UI 外部的回调
  const callbacks = {
    closeUI: () => {
      const container = document.getElementById('log-archive-ui-container');
      if (container) container.style.display = 'none';
    },
    copyCurrentPage: async () => {
      const display = document.getElementById('log-archive-ui-log-display');
      if (display?.value) {
        await navigator.clipboard.writeText(display.value);
        return true;
      }
      return false;
    },
  };

  return (
    <div
      className={`log-archive-app-root ${isReadOnly.value ? 'is-readonly' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      <Header callbacks={callbacks} />

      <div
        id="log-archive-view-container"
        style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {viewMode.value === 'log' && <LogViewer />}
        {viewMode.value === 'config' && <ConfigPanel callbacks={appCallbacks} />}
        {viewMode.value === 'stats' && <StatsView />}
      </div>
    </div>
  );
}
