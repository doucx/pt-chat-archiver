import { useEffect, useRef, useState } from 'preact/hooks';
import { UI_FEEDBACK_DURATION } from '../../constants.js';
import { getStorageUsageInMB, storageManager } from '../../storage/index.js';
import { serverList } from '../store/dataStore';
import {
  activeServer,
  autoFollowServer,
  cachePages,
  initDebounceMs,
  isReadOnly,
  lastServer,
  pageSize,
  readChunkSize,
  recordedChannel,
  selfName,
  statsLimit,
  updateConfig,
  viewingServer,
} from '../store/uiStore';

export function ConfigPanel({ callbacks }) {
  const [usage, setUsage] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const [feedback, setFeedback] = useState({});

  const triggerFeedback = (key) => {
    setFeedback((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setFeedback((prev) => ({ ...prev, [key]: false }));
    }, UI_FEEDBACK_DURATION);
  };

  // 挂载时刷新统计信息
  useEffect(() => {
    getStorageUsageInMB().then(setUsage);
    storageManager.getTotalMessageCount().then(setMsgCount);
  }, []);

  const handleUpdate = (key, val) => {
    updateConfig(key, val);
  };

  const handleSelfNameChange = async (e) => {
    const val = e.target.value.trim();
    selfName.value = val;
    await storageManager.setSelfName(val);
  };

  const [scanState, setScanState] = useState('idle');
  const [duplicateIds, setDuplicateIds] = useState([]);
  const timerRef = useRef(null);

  const renderStatus = () => {
    if (!activeServer.value) {
      return (
        <div style={{ fontSize: '0.85em', marginTop: '8px' }}>
          等待进入游戏...{' '}
          {lastServer.value && <span className="info-text-dim">(上个: {lastServer.value})</span>}
        </div>
      );
    }
    if (!isReadOnly.value) {
      return (
        <div style={{ color: 'var(--color-primary-hover)', fontSize: '0.85em', marginTop: '8px' }}>
          ✅ 正在记录: {activeServer.value}
          {recordedChannel.value ? `::${recordedChannel.value}` : ''}
        </div>
      );
    }
    return (
      <div style={{ color: 'var(--color-text-dim)', fontSize: '0.85em', marginTop: '8px' }}>
        📖 浏览存档: {viewingServer.value}
      </div>
    );
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleScanDuplicates = async () => {
    if (scanState === 'idle' || scanState === 'no_duplicates' || scanState === 'done') {
      setScanState('scanning');
      try {
        const ids = await callbacks.scanDuplicates();
        if (ids.length === 0) {
          setScanState('no_duplicates');
          timerRef.current = setTimeout(() => setScanState('idle'), 1500);
        } else {
          setDuplicateIds(ids);
          setScanState('pending');
        }
      } catch (e) {
        setScanState('idle');
      }
    } else if (scanState === 'pending') {
      if (
        confirm(`【确认】将删除 ${duplicateIds.length} 条重复记录。此操作不可逆。确定要继续吗？`)
      ) {
        setScanState('cleaning');
        await callbacks.deleteMessages(duplicateIds);
        setScanState('done');
        setDuplicateIds([]);
        timerRef.current = setTimeout(() => setScanState('idle'), 1500);
      }
    }
  };

  return (
    <div id="log-archive-config-view" class="config-section">
      <div
        style={{
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: '15px',
          marginBottom: '5px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0, color: 'var(--color-primary)', fontSize: '1.1em' }}>
            PT Chat Archiver
          </h3>
          <span className="info-text-dim" style={{ fontSize: '0.8em' }}>
            v{__APP_VERSION__}
          </span>
        </div>
        {renderStatus()}
      </div>

      <div class="config-group">
        <label htmlFor="config-viewing-server">查看存档服务器</label>
        <div class="config-input-row">
          <select
            id="config-viewing-server"
            className="log-archive-ui-button"
            style={{ flexGrow: 1, minWidth: 0 }}
            value={viewingServer.value}
            onChange={(e) => {
              viewingServer.value = e.target.value;
            }}
          >
            {serverList.value.length === 0 ? (
              <option value="">无存档</option>
            ) : (
              serverList.value.map((s) => (
                <option key={s} value={s}>
                  {s === activeServer.value ? `${s} (正在记录)` : s}
                </option>
              ))
            )}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
          <input
            id="config-auto-follow"
            type="checkbox"
            checked={autoFollowServer.value}
            onChange={(e) => handleUpdate('autoFollowServer', e.target.checked)}
            style={{ width: 'auto', margin: 0 }}
          />
          <label
            htmlFor="config-auto-follow"
            style={{
              fontWeight: 'normal',
              color: 'var(--color-text-dim)',
              fontSize: '0.85em',
              cursor: 'pointer',
            }}
          >
            跟随游戏服务器切换
          </label>
        </div>
      </div>

      <div class="config-group">
        <label htmlFor="config-self-name">用户昵称</label>
        <input
          id="config-self-name"
          type="text"
          value={selfName.value}
          onInput={handleSelfNameChange}
          placeholder="用于识别私聊方向..."
        />
      </div>

      <div class="config-group">
        <label htmlFor="config-page-size">分页大小 (每页消息条数)</label>
        <input
          id="config-page-size"
          type="number"
          value={pageSize.value}
          onChange={(e) => handleUpdate('pageSize', Number.parseInt(e.target.value))}
          min="10"
          max="10000"
          step="100"
        />
      </div>

      <div class="config-group">
        <label htmlFor="config-stats-limit">统计分析上限 (最后 N 条)</label>
        <input
          id="config-stats-limit"
          type="number"
          value={statsLimit.value}
          onChange={(e) => handleUpdate('statsLimit', Number.parseInt(e.target.value))}
          min="100"
          max="50000"
          step="500"
        />
      </div>
      <div class="config-group">
        <label htmlFor="config-read-chunk">数据库读取分片大小</label>
        <input
          id="config-read-chunk"
          type="number"
          value={readChunkSize.value}
          onChange={(e) => handleUpdate('readChunkSize', Number.parseInt(e.target.value))}
          min="50"
          max="2000"
          step="50"
        />
      </div>
      <div class="config-group">
        <label htmlFor="config-init-debounce">初始化防抖延迟 (毫秒)</label>
        <input
          id="config-init-debounce"
          type="number"
          value={initDebounceMs.value}
          onChange={(e) => handleUpdate('initDebounceMs', Number.parseInt(e.target.value))}
          min="50"
          max="5000"
          step="50"
        />
      </div>
      <div class="config-group">
        <label htmlFor="config-cache-pages">内存缓存容量 (页数)</label>
        <input
          id="config-cache-pages"
          type="number"
          value={cachePages.value}
          onChange={(e) => handleUpdate('cachePages', Number.parseInt(e.target.value))}
          min="1"
          max="50"
          step="1"
        />
      </div>

      <div class="config-group">
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>维护操作</div>
        <div class="info-text-dim">估算数据占用: {usage.toFixed(2)} MB</div>
        <div class="info-text-dim" style={{ marginBottom: '8px' }}>
          存档消息总数: {msgCount.toLocaleString()} 条
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              class="log-archive-ui-button"
              onClick={async () => (await callbacks.copyJSON()) && triggerFeedback('copyJSON')}
            >
              {feedback.copyJSON ? '✅ 已复制' : '复制 JSON'}
            </button>
            <button
              type="button"
              class="log-archive-ui-button"
              onClick={async () => (await callbacks.copyTXT()) && triggerFeedback('copyTXT')}
            >
              {feedback.copyTXT ? '✅ 已复制' : '复制 TXT'}
            </button>
            <button
              type="button"
              class="log-archive-ui-button"
              onClick={async () => {
                await callbacks.downloadJSON();
                triggerFeedback('dlJSON');
              }}
            >
              {feedback.dlJSON ? '✅ 开始下载' : '下载 JSON'}
            </button>
            <button
              type="button"
              class="log-archive-ui-button"
              onClick={async () => {
                await callbacks.downloadTXT();
                triggerFeedback('dlTXT');
              }}
            >
              {feedback.dlTXT ? '✅ 开始下载' : '下载 TXT'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              class={`log-archive-ui-button ${scanState === 'pending' ? 'active' : ''}`}
              onClick={handleScanDuplicates}
              disabled={scanState === 'scanning' || scanState === 'cleaning'}
            >
              {scanState === 'idle'
                ? '扫描重复记录'
                : scanState === 'scanning'
                  ? '扫描中...'
                  : scanState === 'pending'
                    ? `清理重复 (${duplicateIds.length})`
                    : scanState === 'cleaning'
                      ? '清理中...'
                      : scanState === 'no_duplicates'
                        ? '未发现重复'
                        : '清理完毕!'}
            </button>
            <button
              type="button"
              class="log-archive-ui-button"
              onClick={async () => {
                // 导入是异步监听文件选择的，回调返回 true 代表触发了逻辑
                if (await callbacks.importAllData()) triggerFeedback('importAll');
              }}
            >
              {feedback.importAll ? '✅ 导入成功' : '导入 JSON (覆盖)'}
            </button>
            <button
              type="button"
              class="log-archive-ui-button"
              style={{
                gridColumn: 'span 2',
                backgroundColor: feedback.importMerge
                  ? 'var(--color-primary)'
                  : 'var(--color-success)',
              }}
              onClick={async () => {
                if (await callbacks.importAndMergeData()) triggerFeedback('importMerge');
              }}
            >
              {feedback.importMerge ? '✅ 合并成功' : '导入 JSON (合并)'}
            </button>
          </div>
        </div>
      </div>

      <div
        class="config-group"
        style={{ marginTop: '10px', borderTop: '1px dashed #444', paddingTop: '20px' }}
      >
        <div style={{ fontWeight: 'bold', color: '#ff6666', marginBottom: '8px' }}>危险操作</div>
        <button type="button" class="log-archive-ui-button" onClick={callbacks.clearAllData}>
          清空所有本地存档
        </button>
      </div>
    </div>
  );
}
