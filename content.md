简要回答
测试失败的根本原因在于我们的架构已经转向了“全面异步化”，而测试用例中的 Mock 适配器和部分断言逻辑仍然停留在同步时代。具体表现为：`getRawState` 在 Mock 中返回了同步对象而非 Promise，导致渲染器报错；同时，由于 `cleanChannelRecords` 现在是异步函数，测试中的点击事件后需要使用 `waitFor` 等待 Promise 解决（如确认框的弹出）。

此外，`state.js` 的重构导致了函数签名的变更，我也将一并更新测试用例。

## [WIP] test: 适配存储层异步化重构，修复测试回归错误

### 错误分析

**1. 异步契约失效 (TypeError)**
在 `tests/ui.integration.test.js` 中，`getRawState` 的 Mock 实现是 `() => state`。而在 `renderer.js` 中，我们调用了 `.then()`。由于同步对象没有 `.then` 方法，导致了 `Unhandled Rejection`。

**2. 函数签名变更 (ReferenceError)**
在 `tests/state.test.js` 中，测试仍在尝试调用已删除的 `addMessageToSyntheticChannelIfNeeded`。该功能已被重构为纯函数 `getSyntheticChannelName`。

**3. 异步竞争 (AssertionError)**
在 `tests/ui.clean_duplicates.test.js` 中，`cleanChannelRecords` 变为 `async`。测试在执行 `fireEvent.click(cleanButton)` 后立即检查 `window.confirm`，此时异步逻辑尚未运行到弹出对话框的那一步。

### 用户需求
修复测试套件，使其与 Phase 2 的异步架构保持一致，消除所有测试报错。

### 评论
测试用例是代码重构的护栏。在架构发生重大变更（同步转异步）时，必须同步更新测试的 Mock 策略。将 Mock 对象中的简单返回改为 `async` 函数是保证测试稳定的关键。

### 目标
1. 更新 `tests/state.test.js` 以适配新的 `getSyntheticChannelName` 纯函数。
2. 修复 `tests/ui.integration.test.js` 中的 Mock 适配器，确保所有方法均返回 Promise。
3. 在 `tests/ui.clean_duplicates.test.js` 中使用 `waitFor` 等待异步操作引发的 UI 反馈（如 `confirm` 和 `alert`）。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #scope/core #ai/instruct #task/domain/testing #task/object/test-suites #task/action/fix #task/state/continue

---

### Script

#### Acts 1: 更新 `state.test.js`
将副作用测试改为对纯函数 `getSyntheticChannelName` 的逻辑测试。

~~~~~act
patch_file
tests/state.test.js
~~~~~
~~~~~javascript
import { describe, expect, it } from 'vitest';
import { addMessageToSyntheticChannelIfNeeded, mergeAndDeduplicateMessages } from '../src/state.js';

describe('state.js: mergeAndDeduplicateMessages', () => {
~~~~~
~~~~~javascript
import { describe, expect, it } from 'vitest';
import { getSyntheticChannelName, mergeAndDeduplicateMessages } from '../src/state.js';

describe('state.js: mergeAndDeduplicateMessages', () => {
~~~~~

~~~~~act
patch_file
tests/state.test.js
~~~~~
~~~~~javascript
describe('state.js: Synthetic Channels', () => {
  it('应当将队伍消息复制到 Party-Local 频道', () => {
    const channelMap = { Local: [] };
    const partyMsg = { type: 'party', content: 'team up!' };
    addMessageToSyntheticChannelIfNeeded(channelMap, partyMsg, 'Local');
    expect(channelMap['Party-Local'][0].content).toBe('team up!');
  });
});
~~~~~
~~~~~javascript
describe('state.js: Synthetic Channels', () => {
  it('应当正确识别需要复制到 Party-Local 频道的队伍消息', () => {
    const partyMsg = { type: 'party', content: 'team up!' };
    const result = getSyntheticChannelName(partyMsg, 'Local');
    expect(result).toBe('Party-Local');
  });

  it('非 Local 频道的队伍消息不应产生合成频道', () => {
    const partyMsg = { type: 'party', content: 'team up!' };
    const result = getSyntheticChannelName(partyMsg, 'Party');
    expect(result).toBeNull();
  });
});
~~~~~

#### Acts 2: 修复 `ui.integration.test.js` 中的 Mock
确保 `getRawState` 返回 Promise。

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript
  getAllData: async () => state,
  getRawState: () => state,
});
~~~~~
~~~~~javascript
  getAllData: async () => state,
  getRawState: async () => state,
});
~~~~~

#### Acts 3: 解决 `ui.clean_duplicates.test.js` 中的异步竞争
由于 `cleanChannelRecords` 现在是异步的，所有的弹出框检查都必须置于 `waitFor` 之中。

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript
    // 执行清理
    fireEvent.click(cleanButton);

    // 验证逻辑：
    // 1. 弹出确认框 (已 mock)
    expect(window.confirm).toHaveBeenCalled();

    // 2. 数据被清理：25 条变 1 条
    expect(mockAppState['Server A'].Local.length).toBe(1);
~~~~~
~~~~~javascript
    // 执行清理
    fireEvent.click(cleanButton);

    // 验证逻辑：
    // 1. 弹出确认框 (已 mock)
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });

    // 2. 数据被清理：25 条变 1 条
    expect(mockAppState['Server A'].Local.length).toBe(1);
~~~~~

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript
    fireEvent.click(cleanButton);
    expect(window.alert).toHaveBeenCalledWith('未发现可清理的重复记录。');
  });
});
~~~~~
~~~~~javascript
    fireEvent.click(cleanButton);
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('未发现可清理的重复记录。');
    });
  });
});
~~~~~

### 下一步建议
修复测试后，建议进行一次全量测试运行 (`npm test`)。如果全部通过，则说明 Phase 2 的“数据库现代化”已经稳固。你可以尝试加载一些真实的、数万条记录的大型 JSON 存档，验证“设置页面”在加载时是否依然流畅。

接下来，我们将进入 **Phase 3: 引入 Web Worker**。这一步将把所有耗时的 IDB 操作和计算彻底搬离主线程，即使在极端负载下也能保证 UI 的 60FPS。如果你准备好进行这项更深度的解耦，请告知我。
