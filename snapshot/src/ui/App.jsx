import { useEffect, useState } from 'preact/hooks';
import { 
  viewMode, 
  isUIPaused, 
  viewingServer, 
  activeServer, 
  recordedChannel,
  isReadOnly 
} from './store/uiStore';
import { TOGGLE_BUTTON_ICON } from './templates';

/**
 * App 根组件：管理全局布局、视图切换和外部 CSS 类绑定
 */
export function App({ dataAdapter, appCallbacks }) {
  const [isVisible, setIsVisible] = useState(false);

  // 监听键盘 Esc 键关闭
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setIsVisible(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const toggleUI = () => setIsVisible(!isVisible);

  return (
    <>
      {/* 侧边切换按钮 (原 dom.toggleButton 逻辑) */}
      <div 
        id="log-archive-ui-toggle-button" 
        onClick={toggleUI}
        style={{ display: 'flex' }}
      >
        {TOGGLE_BUTTON_ICON}
      </div>

      {/* 主容器 */}
      <div 
        id="log-archive-ui-container"
        className={isReadOnly.value ? 'is-readonly' : ''}
        style={{ display: isVisible ? 'flex' : 'none' }}
      >
        {/* 顶部状态栏 (替代原有 Header) */}
        <div id="log-archive-ui-header">
           <div className="status-indicator">
              {activeServer.value ? `✅ ${activeServer.value}` : '💤 等待进入游戏...'}
           </div>
           <div className="view-controls">
              <button onClick={() => viewMode.value = 'log'} className={viewMode.value === 'log' ? 'active' : ''}>📜 记录</button>
              <button onClick={() => viewMode.value = 'stats'} className={viewMode.value === 'stats' ? 'active' : ''}>📊 统计</button>
              <button onClick={() => viewMode.value = 'config'} className={viewMode.value === 'config' ? 'active' : ''}>⚙️ 设置</button>
              <button onClick={toggleUI}>❌</button>
           </div>
        </div>

        <div id="log-archive-view-container">
          {/* 
              视图分发点：
              后续我们将实现 LogViewer, ConfigPanel, StatsView 组件
          */}
          {viewMode.value === 'log' && (
            <div className="placeholder-view">
               <h3>Log Viewer (Pending Refactor)</h3>
               <p>Viewing Server: {viewingServer.value}</p>
            </div>
          )}
          
          {viewMode.value === 'config' && (
            <div className="placeholder-view">
               <h3>Settings (Pending Refactor)</h3>
            </div>
          )}

          {viewMode.value === 'stats' && (
             <div className="placeholder-view">
               <h3>Statistics (Pending Refactor)</h3>
             </div>
          )}
        </div>
      </div>
    </>
  );
}