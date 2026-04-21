你的分析非常精准。在 `7.11.0` 版本中，虽然逻辑变得更加整洁（响应式），但交互上的“打断感”确实因为过度依赖 `alert` 而增加了。

我将按照你的建议，为 UI 层引入一套非阻塞的“按钮反馈”系统。

## [WIP] refactor: 优化 UI 交互体验，将阻塞式 alert 替换为非阻塞式状态反馈

### 用户需求
移除 UI 中导致操作中断的 `alert()` 调用。为所有功能按钮（复制、下载、导入、合并、清理等）添加基于临时状态的视觉反馈，提升交互的平滑度和舒适感。

### 评论
这是一个非常关键的 UX 改进。`alert()` 在 Web 应用中不仅破坏心流，在某些浏览器环境下还会导致状态同步的微妙问题。将反馈集成到按钮本身（Button Toasting）是目前 PT Archiver 最优的交互方案。

### 目标
1.  修改 `src/ui/io-manager.js`：移除成功后的 `alert()`，并使导出/导入函数返回 `Promise<boolean>`。
2.  修改 `src/ui/App.jsx`：使 `copyCurrentPage` 返回执行结果。
3.  修改 `src/ui/index.jsx`：移除维护操作的成功 `alert()`，确保回调结果可被 UI 感知。
4.  重构 `src/ui/components/Header.jsx`：为页顶工具栏的复制按钮添加 ✅ 状态反馈。
5.  重构 `src/ui/components/ConfigPanel.jsx`：为设置面板中的十余个按钮添加统一的、带延时的反馈逻辑。

### 基本原理
利用 Preact 的局部状态 (`useState`) 和 `UI_FEEDBACK_DURATION` 常量。在 UI 组件中通过包装原始回调，在操作成功后切换按钮的文本或图标，并利用 `setTimeout` 在 1.5 秒后自动复原。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/interaction-feedback #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 清理 `io-manager.js` 中的阻塞式弹窗

我们将移除导入和复制成功后的 `alert`，并让这些函数返回布尔值，以便 UI 能够根据结果显示反馈。

~~~~~act
patch_file
src/ui/io-manager.js
~~~~~
~~~~~javascript.old
  const copyJSON = async () => {
    const allData = await dataAdapter.getAllData();
    navigator.clipboard.writeText(JSON.stringify(allData, null, 2));
    alert('✅ 已复制 JSON');
  };

  const copyTXT = async () => {
    const allData = await dataAdapter.getAllData();
    navigator.clipboard.writeText(generateFullTextExport(allData));
    alert('✅ 已复制 TXT');
  };
~~~~~
~~~~~javascript.new
  const copyJSON = async () => {
    const allData = await dataAdapter.getAllData();
    await navigator.clipboard.writeText(JSON.stringify(allData, null, 2));
    return true;
  };

  const copyTXT = async () => {
    const allData = await dataAdapter.getAllData();
    await navigator.clipboard.writeText(generateFullTextExport(allData));
    return true;
  };
~~~~~

~~~~~act
patch_file
src/ui/io-manager.js
~~~~~
~~~~~javascript.old
          if (confirm(warning)) {
            await appCallbacks.saveMessagesToStorage(importedData);
            alert('✅ 导入成功');
            refreshView();
          }
~~~~~
~~~~~javascript.new
          if (confirm(warning)) {
            await appCallbacks.saveMessagesToStorage(importedData);
            refreshView();
            return true;
          }
~~~~~

~~~~~act
patch_file
src/ui/io-manager.js
~~~~~
~~~~~javascript.old
          if (confirm(msg)) {
            await appCallbacks.mergeMessagesToStorage(importedData);
            alert('✅ 合并成功');
            refreshView();
          }
~~~~~
~~~~~javascript.new
          if (confirm(msg)) {
            await appCallbacks.mergeMessagesToStorage(importedData);
            refreshView();
            return true;
          }
~~~~~

#### Acts 2: 优化 `App.jsx` 与 `index.jsx` 的回调接口

确保所有涉及 IO 和维护的操作在成功后不再主动弹窗，而是交由 UI 自行决定如何展示。

~~~~~act
patch_file
src/ui/App.jsx
~~~~~
~~~~~javascript.old
    copyCurrentPage: () => {
      const display = document.getElementById('log-archive-ui-log-display');
      if (display?.value) {
        navigator.clipboard.writeText(display.value);
        alert('✅ 已复制到剪贴板');
      }
    },
~~~~~
~~~~~javascript.new
    copyCurrentPage: async () => {
      const display = document.getElementById('log-archive-ui-log-display');
      if (display?.value) {
        await navigator.clipboard.writeText(display.value);
        return true;
      }
      return false;
    },
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
    alert('旧版备份已删除。');
  };

  const recoverLegacyData = async (targetServer) => {
    try {
      const rawState = await dataAdapter.getAllData();
      const newState = await MigrationManager.recoverAndMergeAll(rawState, targetServer);
      await appCallbacks.saveMessagesToStorage(newState);
      alert('数据恢复合并完成！已自动清理旧版残留。');
      refreshView();
    } catch (err) {
      console.error('[Recovery] Failed:', err);
      alert('恢复失败，详情请查看控制台。');
    }
  };

  const clearLegacyData = async () => {
    MigrationManager.clearAllLegacyData();
    alert('旧版残留数据已清理。');
  };
~~~~~
~~~~~javascript.new
  const deleteV6Backup = async () => {
    await storageManager.deleteV6Backup();
    return true;
  };

  const recoverLegacyData = async (targetServer) => {
    try {
      const rawState = await dataAdapter.getAllData();
      const newState = await MigrationManager.recoverAndMergeAll(rawState, targetServer);
      await appCallbacks.saveMessagesToStorage(newState);
      refreshView();
      return true;
    } catch (err) {
      console.error('[Recovery] Failed:', err);
      alert('恢复失败，详情请查看控制台。');
      return false;
    }
  };

  const clearLegacyData = async () => {
    MigrationManager.clearAllLegacyData();
    return true;
  };
~~~~~

#### Acts 3: 在 `Header.jsx` 中实现“复制反馈”

~~~~~act
patch_file
src/ui/components/Header.jsx
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
import { useState } from 'preact/hooks';
import { UI_FEEDBACK_DURATION } from '../../constants.js';
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
  const [copyStatus, setCopyStatus] = useState(false);
~~~~~

~~~~~act
patch_file
src/ui/components/Header.jsx
~~~~~
~~~~~javascript.old
  const handleResetServer = () => {
    if (activeServer.value) viewingServer.value = activeServer.value;
  };

  return (
~~~~~
~~~~~javascript.new
  const handleResetServer = () => {
    if (activeServer.value) viewingServer.value = activeServer.value;
  };

  const handleCopy = async () => {
    const success = await callbacks.copyCurrentPage();
    if (success) {
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), UI_FEEDBACK_DURATION);
    }
  };

  return (
~~~~~

~~~~~act
patch_file
src/ui/components/Header.jsx
~~~~~
~~~~~javascript.old
          <button
            type="button"
            className="log-archive-ui-button"
            title="复制当前页内容"
            onClick={callbacks.copyCurrentPage}
          >
            📋
          </button>
~~~~~
~~~~~javascript.new
          <button
            type="button"
            className={`log-archive-ui-button ${copyStatus ? 'active' : ''}`}
            title="复制当前页内容"
            onClick={handleCopy}
          >
            {copyStatus ? '✅' : '📋'}
          </button>
~~~~~

#### Acts 4: 在 `ConfigPanel.jsx` 中重构多按钮状态管理

我们将使用一个统一的 `feedback` 对象状态来管理设置面板中众多按钮的视觉反馈。

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
import { useEffect, useRef, useState } from 'preact/hooks';
import { MigrationManager } from '../../migrations.js';
~~~~~
~~~~~javascript.new
import { useEffect, useRef, useState } from 'preact/hooks';
import { UI_FEEDBACK_DURATION } from '../../constants.js';
import { MigrationManager } from '../../migrations.js';
~~~~~

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
export function ConfigPanel({ callbacks }) {
  const [usage, setUsage] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const [legacy, setLegacy] = useState({ v4: false, v5: false, v6: false });
  const [hasBackup, setHasBackup] = useState(false);

  // 挂载时刷新统计信息
~~~~~
~~~~~javascript.new
export function ConfigPanel({ callbacks }) {
  const [usage, setUsage] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const [legacy, setLegacy] = useState({ v4: false, v5: false, v6: false });
  const [hasBackup, setHasBackup] = useState(false);
  const [feedback, setFeedback] = useState({});

  const triggerFeedback = (key) => {
    setFeedback((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setFeedback((prev) => ({ ...prev, [key]: false }));
    }, UI_FEEDBACK_DURATION);
  };

  // 挂载时刷新统计信息
~~~~~

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
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
~~~~~

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
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
~~~~~

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
      {hasBackup && (
        <div class="config-group" style={{ marginTop: '10px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>兼容性清理</div>
          <button type="button" class="log-archive-ui-button" onClick={callbacks.deleteV6Backup}>
            删除旧版 LocalStorage 备份
          </button>
          <div class="info-text-dim" style={{ marginTop: '4px', fontSize: '0.8em' }}>
~~~~~
~~~~~javascript.new
      {hasBackup && (
        <div class="config-group" style={{ marginTop: '10px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>兼容性清理</div>
          <button
            type="button"
            class="log-archive-ui-button"
            onClick={async () => (await callbacks.deleteV6Backup()) && triggerFeedback('delBackup')}
          >
            {feedback.delBackup ? '✅ 备份已清理' : '删除旧版 LocalStorage 备份'}
          </button>
          <div class="info-text-dim" style={{ marginTop: '4px', fontSize: '0.8em' }}>
~~~~~

### 下一步建议
1.  **CSS 动画优化**: 建议在 `style.css` 中为 `.log-archive-ui-button` 添加一个简单的 `transition: all 0.2s;`，使按钮文本和背景色的切换过程更加平滑。
2.  **错误捕获扩展**: 目前我们仅处理了成功路径的反馈。后续可以考虑引入“红色警告”反馈状态（例如导入文件损坏时按钮闪烁红色），以彻底取代所有剩余的 `alert()`。
3.  **单元测试更新**: 由于我们修改了 `io-manager` 的返回签名并移除了弹窗逻辑，建议同步更新 `ui.integration.test.js`，验证按钮点击后文本内容的动态变化。
