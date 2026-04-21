import { channelCounts, channelList } from '../store/dataStore';
import {
  activeServer,
  isReadOnly,
  isUIPaused,
  selectedChannel,
  viewMode,
  viewingServer,
} from '../store/uiStore';

export function Header({ callbacks }) {
  const handleToggleView = (mode) => {
    viewMode.value = viewMode.value === mode ? 'log' : mode;
  };

  const handleResetServer = () => {
    if (activeServer.value) viewingServer.value = activeServer.value;
  };

  return (
    <div id="log-archive-ui-header">
      <div
        id="log-archive-ui-controls"
        style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}
      >
        <select
          id="log-archive-channel-selector"
          className="log-archive-ui-button"
          style={{ flexGrow: 1, marginRight: '10px' }}
          value={selectedChannel.value}
          onChange={(e) => {
            selectedChannel.value = e.target.value;
          }}
        >
          {channelList.value.length === 0 ? (
            <option value="">无记录</option>
          ) : (
            channelList.value.map((ch) => (
              <option key={ch} value={ch}>
                {ch} ({channelCounts.value[ch] || 0})
              </option>
            ))
          )}
        </select>

        <div style={{ display: 'flex', gap: '5px' }}>
          {isReadOnly.value && (
            <button
              type="button"
              className="log-archive-ui-button"
              title="回到正在记录的服务器"
              onClick={handleResetServer}
            >
              📍
            </button>
          )}
          {!isReadOnly.value && (
            <button
              type="button"
              className={`log-archive-ui-button ${isUIPaused.value ? 'paused' : ''}`}
              title="暂停/恢复录制"
              onClick={() => {
                isUIPaused.value = !isUIPaused.value;
              }}
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
          <button
            type="button"
            className="log-archive-ui-button"
            title="复制当前页内容"
            onClick={callbacks.copyCurrentPage}
          >
            📋
          </button>
          <button
            type="button"
            className="log-archive-ui-button"
            title="关闭界面"
            onClick={callbacks.closeUI}
          >
            ❌
          </button>
        </div>
      </div>
    </div>
  );
}
