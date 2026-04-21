好的，我分析了这次自动重构引入的变更。从 `diff` 文件可以看出，项目经历了一次重大的 UI 架构升级，从原生的 DOM 操作迁移到了基于 Preact 和 Signals 的组件化架构。

这次重构非常成功地现代化了代码库，但在此过程中，一些旧有的配置项和功能性 UI 元素未能被迁移到新的 Preact 组件中，导致了功能上的倒退。

我将生成一个计划来修复这些问题，恢复缺失的功能，以确保新架构与旧版本在功能上保持一致。

## [WIP] fix: 恢复重构后缺失的UI配置项和功能

### 用户需求

1.  **恢复配置项**: 在新的“设置”面板中，重新加入原有的“统计分析上限”、“数据库读取分片大小”、“初始化防抖延迟”和“内存缓存容量”这些配置选项。
2.  **恢复备份管理**: 在“设置”面板中，重新加入用于删除旧版（v6）LocalStorage 备份文件的 UI 功能。
3.  **修复硬编码**: 修复统计分析功能中硬编码为 `5000` 的消息上限，使其重新与用户配置联动。
4.  **补充交互反馈**: 为“复制当前页”按钮增加操作成功的提示。

### 评论

这是一个关键的功能修复。恢复这些配置项不仅能让高级用户根据设备性能进行微调，也确保了从旧版本迁移过来的用户能够管理其数据备份。修复硬编码值则保证了软件行为与 UI 配置的一致性。这些改动将使新的 Preact 架构在功能上与之前版本完全对等。

### 目标

1.  **修改 `ConfigPanel.jsx`**: 添加缺失的四个配置输入框，并将其绑定到 `uiStore.js` 中对应的 `signal`。
2.  **修改 `ConfigPanel.jsx`**: 利用已存在的 `hasBackup` 状态，条件性地渲染“删除旧版 LocalStorage 备份”的 UI 区域和按钮。
3.  **修改 `index.jsx`**: 移除硬编码的 `5000`，改为从 `uiStore.js` 的 `statsLimit` signal 中读取统计分析的消息数量。
4.  **修改 `App.jsx`**: 在 `copyCurrentPage` 回调函数中，加入 `alert` 以向用户反馈复制成功。

### 基本原理

本次修复将严格遵循新的 Preact 和 Signals 架构：
*   所有 UI 变更都将通过修改 JSX 组件来完成，确保声明式 UI 的一致性。
*   所有状态和配置的读写都将通过 `uiStore.js` 中的 `signal` 和 `updateConfig` action 来进行，维持单向数据流。
*   所有与外部系统的交互（如 `deleteV6Backup`）都通过 `appCallbacks` 属性传递，保持组件的纯粹性。

### 标签
#intent/fix #flow/ready #priority/high #comp/cli #concept/ui #scope/ux #scope/dx #ai/instruct #task/domain/ui #task/object/refactor-parity #task/action/bug-fix #task/state/begin

---

### Script

#### Acts 1: 恢复 `ConfigPanel` 中缺失的配置项和备份管理UI

我将一次性地对 `src/ui/components/ConfigPanel.jsx` 文件进行修改，补全所有缺失的配置输入框和旧版备份删除功能。

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~jsx.old
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
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>维护操作</div>
        <div class="info-text-dim">估算数据占用: {usage.toFixed(2)} MB</div>
        <div class="info-text-dim" style={{ marginBottom: '8px' }}>
          存档消息总数: {msgCount.toLocaleString()} 条
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button type="button" class="log-archive-ui-button" onClick={callbacks.copyJSON}>
              复制 JSON
            </button>
            <button type="button" class="log-archive-ui-button" onClick={callbacks.copyTXT}>
              复制 TXT
            </button>
            <button type="button" class="log-archive-ui-button" onClick={callbacks.downloadJSON}>
              下载 JSON
            </button>
            <button type="button" class="log-archive-ui-button" onClick={callbacks.downloadTXT}>
              下载 TXT
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
            <button type="button" class="log-archive-ui-button" onClick={callbacks.importAllData}>
              导入 JSON (覆盖)
            </button>
            <button
              type="button"
              class="log-archive-ui-button"
              style={{ gridColumn: 'span 2', backgroundColor: 'var(--color-success)' }}
              onClick={callbacks.importAndMergeData}
            >
              导入 JSON (合并)
            </button>
          </div>
        </div>
      </div>

      {(legacy.v4 || legacy.v5 || legacy.v6) && (
        <div
          class="config-group"
          style={{
            marginTop: '10px',
            padding: '10px',
            background: 'rgba(200, 150, 50, 0.1)',
            border: '1px dashed var(--color-warning)',
          }}
        >
          <div style={{ fontWeight: 'bold', color: 'var(--color-warning)', marginBottom: '4px' }}>
            发现残留数据!
          </div>
          <div class="info-text-dim" style={{ marginBottom: '8px' }}>
            检测到旧版本数据尚未合并。
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              class="log-archive-ui-button"
              style={{ backgroundColor: 'var(--color-warning)', color: '#000', flexGrow: 1 }}
              onClick={() => callbacks.recoverLegacyData(viewingServer.value)}
            >
              尝试合并
            </button>
            <button
              type="button"
              class="log-archive-ui-button"
              style={{ backgroundColor: 'var(--color-danger)', color: '#fff', flexGrow: 1 }}
              onClick={callbacks.clearLegacyData}
            >
              放弃并清理
            </button>
          </div>
        </div>
      )}

      <div
        class="config-group"
        style={{ marginTop: '10px', borderTop: '1px dashed #444', paddingTop: '20px' }}
~~~~~
~~~~~jsx.new
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
            <button type="button" class="log-archive-ui-button" onClick={callbacks.copyJSON}>
              复制 JSON
            </button>
            <button type="button" class="log-archive-ui-button" onClick={callbacks.copyTXT}>
              复制 TXT
            </button>
            <button type="button" class="log-archive-ui-button" onClick={callbacks.downloadJSON}>
              下载 JSON
            </button>
            <button type="button" class="log-archive-ui-button" onClick={callbacks.downloadTXT}>
              下载 TXT
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
            <button type="button" class="log-archive-ui-button" onClick={callbacks.importAllData}>
              导入 JSON (覆盖)
            </button>
            <button
              type="button"
              class="log-archive-ui-button"
              style={{ gridColumn: 'span 2', backgroundColor: 'var(--color-success)' }}
              onClick={callbacks.importAndMergeData}
            >
              导入 JSON (合并)
            </button>
          </div>
        </div>
      </div>

      {(legacy.v4 || legacy.v5 || legacy.v6) && (
        <div
          class="config-group"
          style={{
            marginTop: '10px',
            padding: '10px',
            background: 'rgba(200, 150, 50, 0.1)',
            border: '1px dashed var(--color-warning)',
          }}
        >
          <div style={{ fontWeight: 'bold', color: 'var(--color-warning)', marginBottom: '4px' }}>
            发现残留数据!
          </div>
          <div class="info-text-dim" style={{ marginBottom: '8px' }}>
            检测到旧版本数据尚未合并。
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              class="log-archive-ui-button"
              style={{ backgroundColor: 'var(--color-warning)', color: '#000', flexGrow: 1 }}
              onClick={() => callbacks.recoverLegacyData(viewingServer.value)}
            >
              尝试合并
            </button>
            <button
              type="button"
              class="log-archive-ui-button"
              style={{ backgroundColor: 'var(--color-danger)', color: '#fff', flexGrow: 1 }}
              onClick={callbacks.clearLegacyData}
            >
              放弃并清理
            </button>
          </div>
        </div>
      )}

      {hasBackup && (
        <div class="config-group" style={{ marginTop: '10px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>兼容性清理</div>
          <button type="button" class="log-archive-ui-button" onClick={callbacks.deleteV6Backup}>
            删除旧版 LocalStorage 备份
          </button>
          <div class="info-text-dim" style={{ marginTop: '4px', fontSize: '0.8em' }}>
            迁移至新数据库后生成的备份文件，删除可释放浏览器 LocalStorage 空间。
          </div>
        </div>
      )}

      <div
        class="config-group"
        style={{ marginTop: '10px', borderTop: '1px dashed #444', paddingTop: '20px' }}
~~~~~

#### Acts 2: 修复硬编码的统计分析上限

接下来，我将修复 `src/ui/index.jsx` 中的硬编码问题，并导入所需的 `statsLimit` 信号。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~jsx.old
  selectedChannel,
  setRecordingStatus,
  totalPages,
  viewMode,
~~~~~
~~~~~jsx.new
  selectedChannel,
  setRecordingStatus,
  statsLimit,
  totalPages,
  viewMode,
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~jsx.old
      let offset = undefined;

      if (stateViewMode === 'stats') {
        const stateStatsLimit = 5000;
        fetchSize = stateStatsLimit;
        offset = Math.max(0, totalCount - stateStatsLimit);
        fetchPage = 1;
~~~~~
~~~~~jsx.new
      let offset = undefined;

      if (stateViewMode === 'stats') {
        const stateStatsLimit = statsLimit.value;
        fetchSize = stateStatsLimit;
        offset = Math.max(0, totalCount - stateStatsLimit);
        fetchPage = 1;
~~~~~

#### Acts 3: 为复制按钮添加交互反馈

最后，我将为 `src/ui/App.jsx` 中的复制按钮添加一个简单的 `alert` 提示。

~~~~~act
patch_file
src/ui/App.jsx
~~~~~
~~~~~jsx.old
    copyCurrentPage: () => {
      const display = document.getElementById('log-archive-ui-log-display');
      if (display?.value) {
        navigator.clipboard.writeText(display.value);
        // 这里可以添加更优雅的 Preact Toast 反馈
      }
    },
~~~~~
~~~~~jsx.new
    copyCurrentPage: () => {
      const display = document.getElementById('log-archive-ui-log-display');
      if (display?.value) {
        navigator.clipboard.writeText(display.value);
        alert('✅ 已复制到剪贴板');
      }
    },
~~~~~

### 下一步建议

- **全面审查**: 建议对重构后的其他 UI 部分进行一次全面的功能点对点审查，以确保没有其他细微的功能回归。
- **UI 反馈优化**: 当前的 `alert` 是一种简单有效的反馈方式。在未来的迭代中，可以考虑实现一个非阻塞式的 Toast 通知组件，以提供更现代、更流畅的用户体验。
