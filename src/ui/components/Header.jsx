import { channelCounts, channelList } from '../store/dataStore';
import {
  activeServer,
  isReadOnly,
  isUIPaused,
  lastServer,
  recordedChannel,
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

  const renderStatus = () => {
    if (!activeServer.value) {
      return (
        <span style={{ fontSize: '0.85em' }}>
          等待进入游戏...{' '}
          {lastServer.value && <span className="info-text-dim">(上个: {lastServer.value})</span>}
        </span>
      );
    }
    if (!isReadOnly.value) {
      return (
        <span style={{ color: 'var(--color-primary-hover)', fontSize: '0.85em' }}>
          ✅ 正在记录: {activeServer.value}
          {recordedChannel.value ? `::${recordedChannel.value}` : ''}
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
      <div id="log-archive-server-status" style={{ marginTop: '5px', textAlign: 'center' }}>
        {renderStatus()}
      </div>
    </div>
  );
}
