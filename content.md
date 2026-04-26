这是一个非常合理的交互改进。对于聊天记录工具，用户通常最关心的是最新的消息，因此“首次加载跳转到末尾”应该作为默认行为，但同时允许用户在设置中关闭它。

## [WIP] feat: 增加首次打开 UI 自动跳转到末尾的功能及配置项

### 用户需求
1.  **默认跳转**: 当页面加载后，用户第一次点击图标打开 UI 时，自动跳转到当前频道的最后一页（最新的消息）。
2.  **配置化**: 在设置面板中提供一个开关，允许用户开启或关闭此功能。
3.  **行为约束**: 仅在“第一次”打开时触发，后续在同一会话中关闭再打开 UI 时，应保留用户当前的浏览位置，不重复触发跳转。

### 评论
将“跳转到末尾”作为首次进入的默认行为符合大多数即时通讯软件的逻辑。通过引入一个 session 级别的标记位 `initialJumpDone`，我们可以精准地区分“首次激活”和“后续切换”，从而在提供便利的同时不干扰用户的意图。

### 目标
1.  在 `uiStore.js` 中新增 `defaultToLastPage` 信号及持久化逻辑。
2.  在 `ConfigPanel.jsx` 中添加对应的配置开关。
3.  在 `index.jsx` 的刷新逻辑中实现一次性的跳转逻辑。

### 基本原理
在 `index.jsx` 的 `createUI` 闭包中维护一个 `hasPerformedInitialJump` 变量。当 `isUIVisible` 变为 `true` 且该变量为 `false` 时，程序会在计算出频道总消息数后，强制修改 `currentPage` 为最后一页，并将该变量设为 `true`。

### 标签
#intent/build #flow/ready #priority/medium #comp/ui #concept/config #scope/ux #ai/brainstorm #task/domain/ui #task/object/navigation #task/action/build #task/state/continue

---

### Script

#### Acts 1: 更新 Store 以支持新配置

在 `uiStore.js` 中添加 `defaultToLastPage` 信号，并确保其能正确初始化和保存。

~~~~~act
patch_file
src/ui/store/uiStore.js
~~~~~
~~~~~javascript.old
export const cachePages = signal(5);
export const autoFollowServer = signal(true);
export const selfName = signal('');
~~~~~
~~~~~javascript.new
export const cachePages = signal(5);
export const autoFollowServer = signal(true);
export const defaultToLastPage = signal(true);
export const selfName = signal('');
~~~~~

~~~~~act
patch_file
src/ui/store/uiStore.js
~~~~~
~~~~~javascript.old
  cachePages.value = config.cachePages || 5;
  autoFollowServer.value = config.autoFollowServer !== false;
  selfName.value = await storageManager.getSelfName();
~~~~~
~~~~~javascript.new
  cachePages.value = config.cachePages || 5;
  autoFollowServer.value = config.autoFollowServer !== false;
  defaultToLastPage.value = config.defaultToLastPage !== false;
  selfName.value = await storageManager.getSelfName();
~~~~~

~~~~~act
patch_file
src/ui/store/uiStore.js
~~~~~
~~~~~javascript.old
    initDebounceMs,
    cachePages,
    autoFollowServer,
  };

  if (signalMap[key]) {
    signalMap[key].value = value;
    await storageManager.saveConfig({
      pageSize: pageSize.value,
      statsLimit: statsLimit.value,
      readChunkSize: readChunkSize.value,
      initDebounceMs: initDebounceMs.value,
      cachePages: cachePages.value,
      autoFollowServer: autoFollowServer.value,
    });
  }
};
~~~~~
~~~~~javascript.new
    initDebounceMs,
    cachePages,
    autoFollowServer,
    defaultToLastPage,
  };

  if (signalMap[key]) {
    signalMap[key].value = value;
    await storageManager.saveConfig({
      pageSize: pageSize.value,
      statsLimit: statsLimit.value,
      readChunkSize: readChunkSize.value,
      initDebounceMs: initDebounceMs.value,
      cachePages: cachePages.value,
      autoFollowServer: autoFollowServer.value,
      defaultToLastPage: defaultToLastPage.value,
    });
  }
};
~~~~~

#### Acts 2: 在设置面板增加开关

在 `ConfigPanel.jsx` 的“跟随游戏服务器切换”复选框下方增加“首次打开时跳转到末尾”选项。

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
  recordedChannel,
  selfName,
  statsLimit,
  updateConfig,
  viewingServer,
} from '../store/uiStore';
~~~~~
~~~~~javascript.new
  recordedChannel,
  selfName,
  statsLimit,
  updateConfig,
  viewingServer,
  defaultToLastPage,
} from '../store/uiStore';
~~~~~

~~~~~act
patch_file
src/ui/components/ConfigPanel.jsx
~~~~~
~~~~~javascript.old
            跟随游戏服务器切换
          </label>
        </div>
      </div>

      <div class="config-group">
~~~~~
~~~~~javascript.new
            跟随游戏服务器切换
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
          <input
            id="config-default-to-last"
            type="checkbox"
            checked={defaultToLastPage.value}
            onChange={(e) => handleUpdate('defaultToLastPage', e.target.checked)}
            style={{ width: 'auto', margin: 0 }}
          />
          <label
            htmlFor="config-default-to-last"
            style={{
              fontWeight: 'normal',
              color: 'var(--color-text-dim)',
              fontSize: '0.85em',
              cursor: 'pointer',
            }}
          >
            首次打开 UI 时跳转到末尾
          </label>
        </div>
      </div>

      <div class="config-group">
~~~~~

#### Acts 3: 实现跳转逻辑

在 `index.jsx` 中导入新配置，并实现基于 session 的一次性跳转逻辑。

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
import {
  currentPage,
  initDebounceMs,
  initStore,
  isLockedToBottom,
  isUIPaused,
  isUIVisible,
  loadingMessage,
  pageSize,
  selectedChannel,
  setRecordingStatus,
  statsLimit,
  totalPages,
  viewMode,
  viewingServer,
} from './store/uiStore.js';
~~~~~
~~~~~javascript.new
import {
  currentPage,
  defaultToLastPage,
  initDebounceMs,
  initStore,
  isLockedToBottom,
  isUIPaused,
  isUIVisible,
  loadingMessage,
  pageSize,
  selectedChannel,
  setRecordingStatus,
  statsLimit,
  totalPages,
  viewMode,
  viewingServer,
} from './store/uiStore.js';
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
  document.body.appendChild(toggleButton);

  let currentRenderId = 0;

  const preloadAdjacentPages = async (page, total, server, channel, size) => {
~~~~~
~~~~~javascript.new
  document.body.appendChild(toggleButton);

  let currentRenderId = 0;
  let hasPerformedInitialJump = false;

  const preloadAdjacentPages = async (page, total, server, channel, size) => {
~~~~~

~~~~~act
patch_file
src/ui/index.jsx
~~~~~
~~~~~javascript.old
    let messages = [];
    let totalCount = finalSelectedChannel ? channelCounts[finalSelectedChannel] || 0 : 0;

    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
~~~~~
~~~~~javascript.new
    let messages = [];
    let totalCount = finalSelectedChannel ? channelCounts[finalSelectedChannel] || 0 : 0;

    // 处理首次打开时的自动跳转逻辑
    if (!hasPerformedInitialJump && defaultToLastPage.value && totalCount > 0) {
      const initialTotalPages = Math.ceil(totalCount / statePageSize) || 1;
      batch(() => {
        currentPage.value = initialTotalPages;
        isLockedToBottom.value = true;
      });
      hasPerformedInitialJump = true;
      // 重新捕获跳转后的状态 snapshot
      stateCurrentPage = initialTotalPages;
      stateIsLockedToBottom = true;
    }

    viewCache.init(currentServer, finalSelectedChannel, statePageSize, 5);
~~~~~

### 下一步建议
- **回归测试**: 
    1. 刷新页面，点击图标，确认是否直接显示最后一页（且“双箭头”按钮应处于激活状态）。
    2. 在最后一页向上滚动几条消息（解除锁定），然后点击 X 关闭 UI。
    3. 再次点击图标打开 UI，确认它是否停留在刚才的位置，而不是再次跳回末尾。
    4. 在设置中关闭该功能，刷新页面，确认首次打开时是否默认停在第 1 页。
