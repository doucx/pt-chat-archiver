分析完全正确。测试结果中的失败揭示了两个层面的问题：
1.  **代码层面的逻辑缺陷**：`renderer.js` 的渲染顺序存在 bug，导致首次渲染时无法正确选中默认频道；`templates.js` 缺乏必要的 HTML 关联（`label` 与 `input`），这不仅违反了可访问性原则，也导致了测试库无法定位元素。
2.  **测试策略的偏差**：在测试文件中直接 `import` 状态类并修改，导致测试操作的是一个“孤立”的状态实例，而不是 UI 内部持有的那个。

在开始异步重构前，我们必须修复这些基础问题，确保“安全网”是真实有效的。

---

## [WIP] fix: 修复 UI 渲染逻辑缺陷并完善集成测试环境

### 错误分析

1.  **渲染顺序 Bug (`renderer.js`)**: 在当前的 `render` 函数中，代码先读取了 `dom.channelSelector.value`（此时由于尚未填充，值为空），随后才去更新 `channelSelector` 的选项。这导致首次渲染时 `selectedChannel` 永远是无效的，从而显示“无记录”。
2.  **HTML 结构缺陷 (`templates.js`)**: `label` 标签没有通过 `for` 属性与 `input` 绑定。`testing-library` 的 `getByLabelText` 依赖这种标准的 HTML 关联来寻找元素。
3.  **测试隔离失效 (`ui.integration.test.js`)**: 测试脚本尝试通过 `import` 独立的 `uiState` 来模拟配置修改。然而，`createUI` 内部已经闭包实例化了自己的状态。测试应该通过模拟 DOM 事件（用户行为）来改变状态，这才是真正的集成测试。
4.  **JSDOM 样式处理**: JSDOM 对 `style.display` 的处理在某些情况下可能比较严格，确保逻辑中正确触发了重绘。

### 用户需求

修复现有的 UI 渲染问题，确保插件在启动时能立即显示数据。同时修正测试用例，使其能准确模拟用户在设置页面修改参数并观察到 UI 响应的全过程。

### 评论

这是典型的“通过测试驱动出 Bug”的过程。测试失败恰恰说明我们的重构准备工作非常有价值——它在改动代码前就帮我们抓住了隐蔽的初始化时序问题。

### 目标

1.  **重构 `renderer.js`**: 调整渲染流程，确保在读取当前频道前先完成频道列表的更新。
2.  **修复 `templates.js`**: 为所有配置项添加正确的 `for/id` 关联。
3.  **优化 `ui.integration.test.js`**: 移除直接的状态操作，完全改为通过 `fireEvent` 模拟 UI 交互，并增加必要的异步等待。

### 标签

#intent/fix #flow/ready #priority/high #comp/ui #comp/tests #scope/ux #ai/refine #task/domain/ui #task/object/renderer-logic #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 修复 `templates.js` 中的可访问性关联

我们将为 `label` 标签添加 `for` 属性，以满足测试库的要求并提升 UI 规范性。

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
            <div class="config-group">
                <label>查看存档服务器</label>
                <div style="display: flex; gap: 8px;">
                    <select id="log-archive-server-view-selector" class="log-archive-ui-button" style="flex-grow: 1;"></select>
                    <button id="log-archive-reset-server-button" class="log-archive-ui-button" title="回到正在记录的服务器">📍</button>
                </div>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    切换查看不同服务器的历史记录。注意：此切换仅影响显示，不影响当前的数据录制。
                </div>
            </div>
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>自动保存间隔 (秒)</label>
                <input type="number" id="log-archive-auto-save-interval" min="5" max="3600" step="5">
            </div>
~~~~~
~~~~~javascript.new
            <div class="config-group">
                <label for="log-archive-server-view-selector">查看存档服务器</label>
                <div style="display: flex; gap: 8px;">
                    <select id="log-archive-server-view-selector" class="log-archive-ui-button" style="flex-grow: 1;"></select>
                    <button id="log-archive-reset-server-button" class="log-archive-ui-button" title="回到正在记录的服务器">📍</button>
                </div>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    切换查看不同服务器的历史记录。注意：此切换仅影响显示，不影响当前的数据录制。
                </div>
            </div>
            <div class="config-group">
                <label for="log-archive-self-name-input">用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label for="log-archive-page-size-input">分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label for="log-archive-auto-save-interval">自动保存间隔 (秒)</label>
                <input type="number" id="log-archive-auto-save-interval" min="5" max="3600" step="5">
            </div>
~~~~~

#### Acts 2: 修正 `renderer.js` 的渲染时序

我们需要先填充频道列表，确定好“当前选中的频道”是什么，然后再去获取对应的消息数据。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
    // 3. 获取当前查看服务器的数据切片
    const serverData = appState[viewingServer] || {};
    const selectedChannel = dom.channelSelector.value;
    const messages = serverData[selectedChannel] || [];

    // 4. 更新频道选择器
    const channels = Object.keys(serverData);
    const prevChannelValue = dom.channelSelector.value;
    dom.channelSelector.innerHTML = '';
    if (channels.length === 0) {
      dom.channelSelector.innerHTML = '<option>无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${serverData[ch].length})`;
        dom.channelSelector.appendChild(opt);
      }
      if (channels.includes(prevChannelValue)) {
        dom.channelSelector.value = prevChannelValue;
      }
    }
~~~~~
~~~~~javascript.new
    // 3. 获取当前服务器数据并更新频道选择器
    const serverData = appState[viewingServer] || {};
    const channels = Object.keys(serverData);
    const prevChannelValue = dom.channelSelector.value;

    dom.channelSelector.innerHTML = '';
    if (channels.length === 0) {
      dom.channelSelector.innerHTML = '<option value="">无记录</option>';
    } else {
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = `${ch} (${serverData[ch].length})`;
        dom.channelSelector.appendChild(opt);
      }
      // 尝试恢复之前的选择，或者默认选择第一个可用频道
      if (prevChannelValue && channels.includes(prevChannelValue)) {
        dom.channelSelector.value = prevChannelValue;
      } else if (channels.length > 0) {
        dom.channelSelector.value = channels[0];
      }
    }

    // 4. 现在可以安全地获取选中频道的消息了
    const selectedChannel = dom.channelSelector.value;
    const messages = serverData[selectedChannel] || [];
~~~~~

#### Acts 3: 修正集成测试脚本

我们将完全通过 UI 交互来测试应用，这是最稳健的集成测试方案。

~~~~~act
write_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, getByRole, screen, waitFor } from '@testing-library/dom';
import { createUI } from '../src/ui/index.js';
import '@testing-library/jest-dom/vitest'; // 引入扩展断言

global.__APP_VERSION__ = '7.0.0-test';

const mockCallbacks = {
  scanAndMergeHistory: vi.fn(),
  saveMessagesToStorage: vi.fn(),
  cleanChannelRecords: vi.fn(),
  detectTotalDuplicates: vi.fn(() => 0),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(),
  onAutoSaveIntervalChange: vi.fn(),
};

function renderUI(initialState) {
  document.body.innerHTML = '';
  const ui = createUI(initialState, mockCallbacks);
  ui.updateServerDisplay('Test Server');
  return ui;
}

describe('UI Integration Smoke Tests', () => {
  let mockAppState;

  beforeEach(() => {
    mockAppState = {
      'Test Server': {
        Local: Array.from({ length: 250 }, (_, i) => ({
          time: new Date().toISOString(),
          content: `Message ${i + 1}`,
          type: 'say',
        })),
        Party: [{ time: new Date().toISOString(), content: 'Party Message', type: 'party' }],
      },
    };
    vi.clearAllMocks();
  });

  it('初始加载时应正确渲染数据和默认频道', async () => {
    renderUI(mockAppState);

    // 验证默认选中的频道是 Local 并且显示了数据
    const channelSelector = screen.getByRole('combobox');
    expect(channelSelector.value).toBe('Local');

    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 1');
  });

  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');
    const logView = document.getElementById('log-archive-log-view');
    const configView = document.getElementById('log-archive-config-view');

    // 初始状态
    expect(logView).toBeVisible();
    expect(configView).not.toBeVisible();

    // 点击设置 (模拟切换到 config 模式)
    fireEvent.click(settingsButton);
    expect(logView).not.toBeVisible();
    expect(configView).toBeVisible();

    // 再次点击切回
    fireEvent.click(settingsButton);
    expect(logView).toBeVisible();
  });

  it('在设置中修改分页大小应能实时改变日志显示条数', async () => {
    renderUI(mockAppState);

    // 1. 进入设置
    fireEvent.click(screen.getByTitle('设置'));

    // 2. 找到分页大小输入框并改为 50
    const pageSizeInput = screen.getByLabelText(/分页大小/);
    fireEvent.change(pageSizeInput, { target: { value: '50' } });

    // 3. 切回日志视图
    fireEvent.click(screen.getByTitle('设置'));

    // 4. 验证分页总数变为 5 (250 / 50)
    await waitFor(() => {
      expect(screen.getByText('1 / 5')).toBeInTheDocument();
    });

    // 5. 验证内容只显示到第 50 条
    const logDisplay = screen.getByRole('textbox');
    expect(logDisplay.value).toContain('Message 50');
    expect(logDisplay.value).not.toContain('Message 51');
  });

  it('点击分页按钮应能切换页面内容', async () => {
    renderUI(mockAppState);

    // 调整分页为 100 以便测试
    fireEvent.click(screen.getByTitle('设置'));
    fireEvent.change(screen.getByLabelText(/分页大小/), { target: { value: '100' } });
    fireEvent.click(screen.getByTitle('设置'));

    const logDisplay = screen.getByRole('textbox');
    const nextButton = screen.getByRole('button', { name: '›' });

    expect(logDisplay.value).toContain('Message 100');
    expect(logDisplay.value).not.toContain('Message 101');

    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });
    expect(logDisplay.value).toContain('Message 101');
  });
});
~~~~~

### 下一步建议

1.  **再次运行测试**：执行 `npm test`。随着渲染逻辑和 HTML 结构的修复，这四个 UI 集成测试现在应该能够全部通过。
2.  **清理冗余**：如果测试通过，你可以删除之前在 `ui_state.test.js` 中那些过于细碎的测试，因为集成测试已经覆盖了它们。
3.  **开始异步化**：在 UI 安全网稳固后，我们就可以按照原定计划，开始修改 `storage.js` 将其 API 转化为 `Promise` 形式，并观察集成测试是否依然保持通过。
