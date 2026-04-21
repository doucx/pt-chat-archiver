你的分析非常敏锐。这确实是一个由于异步竞争和组件状态订阅不完整导致的典型 Bug。

当你在数据加载（特别是耗时较长的统计数据拉取）过程中切换视图时，旧的异步任务被中止但未清理全局的 `loadingMessage` 信号；同时 `StatsView` 也没有订阅这个信号来显示进度，导致了你描述的现象。

我将通过以下计划来修复这两个问题。

## [WIP] fix: 修复统计视图加载状态残留及进度显示不全的问题

### 错误分析
1.  **状态残留**: 当用户在数据加载过程中快速切换视图模式（如从 `stats` 切到 `log` 或 `config`）时，负责执行加载任务的异步函数会因为 `renderId` 不匹配而中途退出 (`bail out`)。由于退出时未清理 `loadingMessage` 信号，导致旧的加载进度文字永久残留在 `LogViewer` 中，遮挡了正常日志。
2.  **进度显示缺失**: `StatsView` 组件在设计时未订阅 `loadingMessage` 信号，导致在统计大数据量（触发分片读取）时，用户看不到进度百分比，只能看到旧的或空的统计结果，直到加载完全结束。

### 用户需求
1.  确保在任何视图切换或由于数据缺失导致任务中止时，加载提示能被正确清理。
2.  在统计视图中也能实时看到数据读取进度。

### 评论
这是响应式状态管理中常见的边界处理问题。确保每个异步逻辑路径（包括中止路径）都能正确维护全局状态是系统健壮性的关键。

### 目标
1.  修改 `StatsView.jsx`，使其在 `textarea` 中优先显示 `loadingMessage`。
2.  修改 `index.jsx` 中的 `refreshView` 函数，确保在不进行数据拉取的分支（如 `config` 模式或无服务器状态）下显式清除 `loadingMessage`。

### 基本原理
1.  通过统一 `LogViewer` 和 `StatsView` 对 `loadingMessage` 的引用逻辑，保证用户在任何视图下都能获得一致的加载反馈。
2.  在 `refreshView` 的入口分支增加状态清理逻辑。当一个新的 `render` 周期开始且判定不需要进入加载流程时，立即重置 `loadingMessage`，从而覆盖并清理掉上一个被中止周期遗留的状态。

### 标签
#intent/fix #flow/ready #priority/high #comp/ui #concept/state #scope/ux #ai/refine #task/domain/ui #task/object/loading-state #task/action/bug-fix #task/state/begin

---

### Script

#### Acts 1: 更新 `StatsView.jsx` 以显示加载进度

我们将 `StatsView` 的 `value` 属性修改为优先显示 `loadingMessage`，这与 `LogViewer` 的行为保持一致。

~~~~~act
patch_file
src/ui/components/StatsView.jsx
~~~~~
~~~~~javascript.old
import { useMemo } from 'preact/hooks';
import { generateStatisticsText } from '../../analysis.js';
import { currentMessages } from '../store/dataStore';
import { selectedChannel } from '../store/uiStore';

export function StatsView() {
~~~~~
~~~~~javascript.new
import { useMemo } from 'preact/hooks';
import { generateStatisticsText } from '../../analysis.js';
import { currentMessages } from '../store/dataStore';
import { loadingMessage, selectedChannel } from '../store/uiStore';

export function StatsView() {
~~~~~

~~~~~act
patch_file
src/ui/components/StatsView.jsx
~~~~~
~~~~~javascript.old
  return (
    <div
      id="log-archive-stats-view"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px' }}
    >
      <textarea
        readOnly
        className="log-archive-ui-log-display"
        style={{ flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.2)' }}
        value={statsText}
      />
    </div>
  );
}
~~~~~
~~~~~javascript.new
  return (
    <div
      id="log-archive-stats-view"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px' }}
    >
      <textarea
        readOnly
        className="log-archive-ui-log-display"
        style={{ flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.2)' }}
        value={loadingMessage.value || statsText}
      />
    </div>
  );
}
~~~~~

#### Acts 2: 优化 `index.jsx` 中的加载状态清理逻辑

在 `refreshView` 函数中，我们在判定不需要加载的分支处增加对 `loadingMessage` 的重置，防止异步竞争导致的文字残留。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
    if (!currentServer) {
      serverListSig.value = [];
      channelListSig.value = [];
      channelCountsSig.value = {};
      currentMessages.value = [];
      totalCountSig.value = 0;
      return;
    }
~~~~~
~~~~~javascript.new
    if (!currentServer) {
      serverListSig.value = [];
      channelListSig.value = [];
      channelCountsSig.value = {};
      currentMessages.value = [];
      totalCountSig.value = 0;
      loadingMessage.value = '';
      return;
    }
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
    viewCache.setTotalCount(totalCount);

    if (currentServer && finalSelectedChannel && stateViewMode !== 'config') {
~~~~~
~~~~~javascript.new
    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
    viewCache.setTotalCount(totalCount);

    if (stateViewMode === 'config') {
      loadingMessage.value = '';
    }

    if (currentServer && finalSelectedChannel && stateViewMode !== 'config') {
~~~~~

### 下一步建议
- **回归测试**: 在统计大数据量（触发分片读取和进度更新）时，频繁点击切换“日志”和“统计”按钮，验证进度条是否能即时显示并在切换后消失。
- **体验优化**: 现在的进度文字显示在 `textarea` 内部，虽然简单但有时会显得突兀。未来可以考虑引入一个专门的悬浮遮罩层 (`Loading Overlay`) 来承载这些提示信息。
