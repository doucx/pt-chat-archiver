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