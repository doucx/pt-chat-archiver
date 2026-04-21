你的分析非常准确。将实时状态信息从全局通用的 `Header` 移动到功能更密集的 `ConfigPanel`（设置页面）是一个很好的 UX 改进，这能让主界面保持简洁，同时在设置时提供必要的上下文反馈。

我将生成一个计划来执行这项重构：清理 `Header.jsx` 中的状态逻辑和 DOM 结构，并将其迁移到 `ConfigPanel.jsx` 的顶部。

## [WIP] refactor: 将服务器录制状态显示从 Header 迁移至 ConfigPanel

### 用户需求
需要将 UI 顶部的“正在记录/浏览存档”状态条从 `Header` 组件移动到 `ConfigPanel` 组件的顶部，并相应清理 `Header` 中的冗余代码。

### 评论
这个改动提升了 UI 的整洁度。`Header` 作为主要交互区，应当保持紧凑。将详细的状态信息（如具体的服务器名和正在记录的频道）放入设置面板更符合信息层级的逻辑，因为用户通常在需要调整配置或维护数据时才关心这些细节。

### 目标
1.  从 `src/ui/components/Header.jsx` 中完全移除 `renderStatus` 函数及其对应的底部 `div` 容器。
2.  清理 `src/ui/components/Header.jsx` 中不再使用的信号导入（`lastServer`, `recordedChannel`）。
3.  在 `src/ui/components/ConfigPanel.jsx` 中引入 `isReadOnly` 和 `recordedChannel` 信号。
4.  在 `ConfigPanel` 组件内部重新实现 `renderStatus` 逻辑，并将其放置在面板顶部的标题栏下方。

### 基本原理
通过修改 Preact 组件的 JSX 结构和信号订阅来实现。由于状态存储在全局的 `uiStore` 中，我们只需要在 `ConfigPanel` 中重新订阅这些信号即可实现无缝迁移。我们将原有的 `span` 包装改为 `div`，以便在设置面板的纵向布局中获得更好的显示效果。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/status-display #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 清理 `Header.jsx`

移除状态渲染逻辑、底部 DOM 节点以及不再需要的信号导入。

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
~~~~~
~~~~~javascript.new
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
~~~~~

~~~~~act
patch_file
src/ui/components/Header.jsx
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
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
~~~~~

#### Acts 2: 增强 `ConfigPanel.jsx`

在设置面板顶部植入状态显示逻辑。

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
import {
  activeServer,
  autoFollowServer,
  cachePages,
  initDebounceMs,
  lastServer,
  pageSize,
  readChunkSize,
  selfName,
  statsLimit,
  updateConfig,
  viewingServer,
} from '../store/uiStore';
~~~~~
~~~~~javascript.new
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
~~~~~

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
  const [duplicateIds, setDuplicateIds] = useState([]);
  const timerRef = useRef(null);
~~~~~
~~~~~javascript.new
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
        <div
          style={{ color: 'var(--color-primary-hover)', fontSize: '0.85em', marginTop: '8px' }}
        >
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
~~~~~

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
          <span className="info-text-dim" style={{ fontSize: '0.8em' }}>
            v{__APP_VERSION__}
          </span>
        </div>
      </div>
~~~~~
~~~~~javascript.new
          <span className="info-text-dim" style={{ fontSize: '0.8em' }}>
            v{__APP_VERSION__}
          </span>
        </div>
        {renderStatus()}
      </div>
~~~~~

### 下一步建议
1.  **界面验证**: 进入设置面板，验证状态信息是否正确显示，并尝试切换服务器或频道，确保状态能实时更新。
2.  **样式微调**: 检查状态文字在 `ConfigPanel` 标题栏下的边距和对齐是否美观。如果需要更显著的提示，可以考虑为其增加一个轻微的背景色或边框。
3.  **提交更改**: 如果显示效果满意，可以进行 Git 提交。
