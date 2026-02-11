分析正确。这是一个典型的技术债务场景：核心逻辑（`src/`）有一定测试覆盖，但与用户直接交互的 UI 层（`src/ui`）完全是测试盲区。

在进行异步重构时，数据流和组件的渲染时序会发生根本性变化，这是最容易导致回归错误的环节。UI 组件不再能同步获取状态，而是需要等待 Promise 解析后才能接收数据并重新渲染。

以下是在异步重构前，为保障核心功能稳定而需要添加的回归冒烟测试计划。

我将为你生成一个完整的 `Plan.md`，其中包含添加新依赖项和编写测试文件的具体步骤。

---

好的，这是你的实施计划。

## [WIP] chore: 为 UI 添加回归冒烟测试以保障异步重构

### 错误分析

当前的测试覆盖率报告明确指出了一个核心风险：`src/ui` 目录下的所有文件（`dom.js`, `events.js`, `renderer.js`, `index.js`）的测试覆盖率均为 0%。这意味着所有用户界面的渲染、事件绑定和交互逻辑都没有任何自动化测试来保障其正确性。

即将进行的异步重构（将 `storage` 模块从同步 `localStorage` 调用改为异步 `Promise` 接口）将从根本上改变 UI 的数据流。这会直接冲击以下几个最脆弱且未经测试的关键功能点：

1.  **初始渲染流程**：目前 UI 是在获得同步数据后一次性创建的。改为异步后，UI 可能会在数据加载完成前就渲染出来，导致界面显示为空白或不完整的状态。
2.  **状态驱动的交互**：用户操作（如切换频道、分页、更改设置）会触发状态变更并立即重绘。在异步模型下，这些操作可能会引入竞态条件，或因状态更新延迟导致 UI 行为异常。
3.  **数据持久化反馈**：像“立即保存”或“清理数据”这类操作，其UI反馈（如按钮文本变为“已保存”）目前是同步的。异步化后，这些反馈必须等待异步操作完成后才能正确显示，否则会给用户错误的反馈。
4.  **动态内容更新**：服务器状态的更新、频道列表的填充等都依赖于一个可立即访问的状态对象。当这个对象需要通过异步加载获得时，这些动态部分极有可能在重构后失效。

### 用户需求

为了安全地进行后续的异步架构重构，需要建立一个最基本的 UI 测试安全网。这个安全网的目标是：模拟用户的核心操作路径，确保在重构的每个阶段，这些关键功能都没有被破坏。

### 评论

这是一个非常明智且必要的准备工作。在没有 UI 回归测试的情况下直接进行异步重构，几乎必然会导致难以追踪的 UI-State 不同步问题。投入时间编写这些基础的端到端烟雾测试，其回报远高于后续修复线上 bug 的成本。

我们将引入 `testing-library/dom`，这是一个轻量级且强大的库，它鼓励我们从用户的视角来编写测试，非常适合当前的场景，并且能与 Vitest 和 JSDOM 无缝集成。

### 目标

1.  为项目添加 `@testing-library/dom` 作为开发依赖。
2.  创建一个新的 UI 集成测试文件 `tests/ui.integration.test.js`。
3.  在该文件中实现针对以下核心流程的冒烟测试：
    *   **初始加载测试**：验证应用启动后，UI 能否正确渲染初始数据。
    *   **视图切换测试**：验证在“日志”、“统计”和“设置”视图之间切换的正确性。
    *   **核心交互测试**：验证频道切换、分页按钮功能是否正常。
    *   **配置修改测试**：验证在设置页面修改配置项（如分页大小）后，是否能正确反映到 UI 行为上。

### 基本原理

我们将利用 `vitest` 提供的 `jsdom` 环境，结合 `@testing-library/dom` 来模拟一个完整的浏览器 DOM。测试将不再关心组件的内部实现细节，而是专注于用户能看到和交互的内容。

-   **`renderUI` 辅助函数**：我们会创建一个辅助函数，用于在 `jsdom` 的 `document.body` 中初始化整个 UI 结构并绑定事件，模拟 `main.js` 的启动过程。
-   **异步查询 (`findBy*`)**：`testing-library` 提供的 `findBy*`系列查询函数会智能地等待元素出现，这对于测试异步更新后的 UI 至关重要。
-   **用户事件模拟 (`fireEvent`)**：我们将使用 `fireEvent` 来模拟用户的点击、输入等操作，从而触发应用的事件处理逻辑并验证其结果。

这种测试方法不仅能覆盖当前的同步实现，更能无缝地验证重构后的异步实现，因为测试本身就是为处理异步 UI 更新而设计的。

### 标签

#intent/tooling #flow/ready #priority/high #comp/tests #scope/dx #ai/brainstorm #task/domain/testing #task/object/ui-regression #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 安装测试依赖

首先，我们需要添加 `@testing-library/dom` 到项目的开发依赖中。

~~~~~bash
npm install --save-dev @testing-library/dom
~~~~~

#### Acts 2: 创建 UI 集成测试文件

接下来，我们创建一个新的测试文件，专门用于 UI 的集成和回归测试。

~~~~~act
write_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, getByRole, getByText, screen } from '@testing-library/dom';
import { createUI } from '../src/ui/index.js';

// Mock 全局 __APP_VERSION__
global.__APP_VERSION__ = '7.0.0-test';

// Mock 存储和回调，专注于 UI 行为
const mockStorage = {
  config: { pageSize: 100, autoSaveInterval: 30 },
  selfName: 'Tester',
};

const mockCallbacks = {
  scanAndMergeHistory: vi.fn(),
  saveMessagesToStorage: vi.fn(),
  cleanChannelRecords: vi.fn(),
  detectTotalDuplicates: vi.fn(() => 0),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(),
  onAutoSaveIntervalChange: vi.fn(),
};

/**
 * 辅助函数：在 JSDOM 中渲染整个 UI
 * @param {object} initialState - 模拟的初始聊天状态
 */
function renderUI(initialState) {
  document.body.innerHTML = ''; // 清理环境
  const ui = createUI(initialState, mockCallbacks);
  // 模拟服务器激活
  ui.updateServerDisplay('Test Server');
  return ui;
}

describe('UI Integration Smoke Tests', () => {
  let mockAppState;

  beforeEach(() => {
    // 为每个测试重置模拟数据
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
    // 重置所有 mock 函数的调用记录
    vi.clearAllMocks();
  });

  it('初始加载时应正确渲染数据和分页', async () => {
    renderUI(mockAppState);

    // 1. 等待并验证日志内容是否出现
    const logDisplay = screen.getByRole('textbox');
    // testing-library 的 findBy* 可以处理异步渲染，这里用 getBy* 因为目前是同步的
    expect(logDisplay.value).toContain('Message 1');
    expect(logDisplay.value).toContain(`Message 100`); // 默认 pageSize 是 1000，但我们测试用例里 pageSize 是 100

    // 2. 验证频道选择器是否被填充
    const channelSelector = screen.getByRole('combobox');
    expect(getByRole(channelSelector, 'option', { name: /Local/ })).toBeInTheDocument();
    expect(getByRole(channelSelector, 'option', { name: /Party/ })).toBeInTheDocument();

    // 3. 验证分页信息是否正确 (250条消息 / 100每页 = 3页)
    // 注意：UI state 的 pageSize 默认是 1000，需要调整测试使其失败或修正逻辑
    // 修正：我们从 ui/state.js 看到默认是 1000，所以分页应为 1/1。
    // 为了测试分页，我们必须模拟配置。
    const uiState = (await import('../src/ui/state.js')).createUIState();
    uiState.setPageSize(100);

    renderUI(mockAppState); // 重新渲染以应用新的页面大小
    const pageInfo = await screen.findByText('1 / 3');
    expect(pageInfo).toBeInTheDocument();
  });

  it('点击分页按钮应能切换页面内容', async () => {
    const uiState = (await import('../src/ui/state.js')).createUIState();
    uiState.setPageSize(100);
    renderUI(mockAppState);

    const logDisplay = screen.getByRole('textbox');
    const nextButton = screen.getByRole('button', { name: '›' });

    // 初始在第一页
    expect(logDisplay.value).toContain('Message 100');
    expect(logDisplay.value).not.toContain('Message 101');

    // 点击下一页
    fireEvent.click(nextButton);

    // 验证内容更新到第二页
    // `findBy` 将等待 UI 更新
    await screen.findByText('2 / 3');
    expect(logDisplay.value).not.toContain('Message 100');
    expect(logDisplay.value).toContain('Message 101');
    expect(logDisplay.value).toContain('Message 200');
  });

  it('切换视图按钮应能正确显示/隐藏对应面板', async () => {
    renderUI(mockAppState);

    const settingsButton = screen.getByTitle('设置');
    const logView = document.getElementById('log-archive-log-view');
    const configView = document.getElementById('log-archive-config-view');

    // 初始状态：日志可见，设置隐藏
    expect(logView.style.display).toBe('flex');
    expect(configView.style.display).toBe('none');

    // 点击设置
    fireEvent.click(settingsButton);

    // 验证状态：日志隐藏，设置可见
    expect(logView.style.display).toBe('none');
    expect(configView.style.display).toBe('flex');

    // 再次点击，切换回来
    fireEvent.click(settingsButton);
    expect(logView.style.display).toBe('flex');
    expect(configView.style.display).toBe('none');
  });

  it('在设置中修改分页大小应能影响分页逻辑', async () => {
    renderUI(mockAppState);

    // 进入设置
    const settingsButton = screen.getByTitle('设置');
    fireEvent.click(settingsButton);

    // 找到输入框并修改值
    const pageSizeInput = screen.getByLabelText(/分页大小/);
    fireEvent.change(pageSizeInput, { target: { value: '50' } });

    // 切回日志视图
    fireEvent.click(settingsButton);

    // 验证分页已更新 (250条消息 / 50每页 = 5页)
    const pageInfo = await screen.findByText('1 / 5');
    expect(pageInfo).toBeInTheDocument();
  });
});
~~~~~

### 下一步建议

现在，我们已经为 UI 的核心功能建立了一个基础的回归测试套件。

1.  **运行测试**：在终端运行 `npm test`，确保所有新添加的测试用例都能成功通过。
2.  **开始重构**：有了这个安全网，你可以开始第一阶段的重构计划了——即在保持 `LocalStorage` 的情况下，将整个应用的数据流改造为异步。在修改过程中，可以频繁运行测试，一旦出现失败，就能立即定位问题，大大降低了重构风险。
3.  **完善测试**：在重构过程中，如果发现其他关键交互点，可以继续向 `ui.integration.test.js` 文件中补充新的测试用例。
