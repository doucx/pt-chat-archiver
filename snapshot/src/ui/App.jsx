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