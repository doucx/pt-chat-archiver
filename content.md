好的，我们现在开始执行重构建议中的 **第一步：补齐核心逻辑的单元测试**。

这一步的目标是消除核心逻辑中的测试盲区。我们将为状态机 `machine.js` 建立完整的测试覆盖（目前为 0%），并提升 `transformer.js` 的健壮性测试，确保数据转换逻辑在面对各种异常输入时依然稳定。

这是一个典型的“低成本、高收益”操作，它能为后续更大规模的结构重构（如拆分 UI 和 Main）提供安全网。

## [WIP] test: 补齐 machine.js 与 transformer.js 的单元测试

### 用户需求
提高项目的测试覆盖率，特别是针对 `machine.js`（状态机）和 `transformer.js`（数据转换器）这两个核心模块。

### 评论
核心逻辑模块的高覆盖率是重构的先决条件。状态机控制着整个应用的采集生命周期，而转换器负责数据的版本兼容性，它们必须 100% 可靠。

### 目标
1.  创建 `tests/machine.test.js`，实现对 `ArchiverMachine` 所有状态转换和锁竞争逻辑的 100% 覆盖。
2.  创建 `tests/transformer.test.js`，验证 V6 嵌套结构与 V7 扁平结构之间的双向转换，并覆盖边界条件（Null、空对象、异常字段等）。

### 基本原理
由于这两个模块都是纯逻辑实现，不直接依赖 DOM（除了 `machine.js` 的状态定义），我们可以通过 Vitest 在模拟环境下进行快速的单元测试。通过穷举状态转换路径和模拟各种数据输入，确保逻辑分支无遗漏。

### 标签
#intent/tooling #flow/ready #priority/high 
#comp/tests #comp/engine #concept/state #scope/dx 
#ai/delegate
#task/domain/testing
#task/object/coverage-improvement
#task/action/implementation
#task/state/begin

---

### Script

#### Acts 1: 为状态机创建单元测试

我们将测试 `ArchiverMachine` 的初始状态、状态转换约束、以及它如何处理异步扫描的并发锁（这是防止多次重复扫描数据库的关键）。

~~~~~act
write_file
tests/machine.test.js
~~~~~
~~~~~javascript
import { beforeEach, describe, expect, it } from 'vitest';
import { ArchiverMachine, EngineStates } from '../src/machine.js';

describe('ArchiverMachine (State Machine)', () => {
  let machine;

  beforeEach(() => {
    machine = new ArchiverMachine();
  });

  it('应当具有正确的初始状态', () => {
    expect(machine.state).toBe(EngineStates.STOPPED);
    expect(machine.isScanning).toBe(false);
    expect(machine.scanPending).toBe(false);
  });

  it('transition() 应当能正确改变状态', () => {
    machine.transition(EngineStates.STARTING);
    expect(machine.state).toBe(EngineStates.STARTING);
    expect(machine.isStarting()).toBe(true);

    machine.transition(EngineStates.RECORDING);
    expect(machine.state).toBe(EngineStates.RECORDING);
    expect(machine.canProcessLiveMessage()).toBe(true);
  });

  it('transition() 到相同状态时不应有副作用', () => {
    machine.transition(EngineStates.RECORDING);
    const firstState = machine.state;
    machine.transition(EngineStates.RECORDING);
    expect(machine.state).toBe(firstState);
  });

  describe('并发锁管理 (Scan Lock)', () => {
    it('在空闲时应当能获取锁', () => {
      const acquired = machine.tryAcquireScanLock();
      expect(acquired).toBe(true);
      expect(machine.isScanning).toBe(true);
    });

    it('在已加锁时尝试获取锁，应当标记为 pending', () => {
      machine.tryAcquireScanLock();
      const secondAttempt = machine.tryAcquireScanLock();
      
      expect(secondAttempt).toBe(false);
      expect(machine.isScanning).toBe(true);
      expect(machine.scanPending).toBe(true);
      expect(machine.hasPendingScan()).toBe(true);
    });

    it('releaseScanLock() 应当释放锁定状态', () => {
      machine.tryAcquireScanLock();
      machine.releaseScanLock();
      expect(machine.isScanning).toBe(false);
    });

    it('clearScanPending() 应当清除待处理标记', () => {
      machine.tryAcquireScanLock();
      machine.tryAcquireScanLock(); // 产生 pending
      machine.clearScanPending();
      expect(machine.scanPending).toBe(false);
    });
  });

  it('reset() 应当恢复所有初始值', () => {
    machine.transition(EngineStates.RECORDING);
    machine.tryAcquireScanLock();
    machine.tryAcquireScanLock();
    
    machine.reset();
    
    expect(machine.state).toBe(EngineStates.STOPPED);
    expect(machine.isScanning).toBe(false);
    expect(machine.scanPending).toBe(false);
  });
});
~~~~~

#### Acts 2: 为数据转换器创建单元测试

我们将针对 V6（嵌套对象）和 V7（扁平数组）的转换逻辑编写测试，重点关注异常数据的处理。

~~~~~act
write_file
tests/transformer.test.js
~~~~~
~~~~~javascript
import { describe, expect, it } from 'vitest';
import { flattenV6State, nestV7Messages } from '../src/data/transformer.js';

describe('Data Transformer (V6 <-> V7)', () => {
  describe('flattenV6State', () => {
    it('处理正常嵌套数据', () => {
      const v6 = {
        'Server1': {
          'ChannelA': [
            { content: 'hello', time: 't1' },
            { content: 'world', time: 't2' }
          ]
        }
      };
      const flat = flattenV6State(v6);
      expect(flat).toHaveLength(2);
      expect(flat[0]).toEqual({ content: 'hello', time: 't1', server: 'Server1', channel: 'ChannelA' });
      expect(flat[1].server).toBe('Server1');
    });

    it('处理空输入或非法输入', () => {
      expect(flattenV6State(null)).toEqual([]);
      expect(flattenV6State(undefined)).toEqual([]);
      expect(flattenV6State({})).toEqual([]);
    });

    it('跳过非数组的消息容器', () => {
      const v6 = { 'S': { 'C': 'not-an-array' } };
      expect(flattenV6State(v6)).toEqual([]);
    });
  });

  describe('nestV7Messages', () => {
    it('处理正常的扁平数组', () => {
      const flat = [
        { content: 'msg1', server: 'S1', channel: 'C1', extra: 'foo' },
        { content: 'msg2', server: 'S1', channel: 'C1' },
        { content: 'msg3', server: 'S2', channel: 'C2' }
      ];
      const nested = nestV7Messages(flat);
      
      expect(nested.S1.C1).toHaveLength(2);
      expect(nested.S2.C2).toHaveLength(1);
      // 检查字段剥离：嵌套结果中不应包含冗余的 server/channel 字段
      expect(nested.S1.C1[0].server).toBeUndefined();
      expect(nested.S1.C1[0].extra).toBe('foo');
    });

    it('处理非数组输入', () => {
      expect(nestV7Messages(null)).toEqual({});
      expect(nestV7Messages('invalid')).toEqual({});
    });

    it('应当过滤掉缺少 server 或 channel 字段的损坏记录', () => {
      const flat = [
        { content: 'good', server: 'S1', channel: 'C1' },
        { content: 'bad', server: 'S1' }, // 缺少 channel
        { content: 'ugly', channel: 'C1' } // 缺少 server
      ];
      const nested = nestV7Messages(flat);
      expect(nested.S1.C1).toHaveLength(1);
      expect(nested.S1.C1[0].content).toBe('good');
    });
  });
});
~~~~~

### 下一步建议

现在我们已经为状态机和转换逻辑建立了坚实的测试基础。你可以运行 `npm test` 来验证这些新编写的测试是否全部通过。

接下来的建议步骤是执行 **优先级 4** 中的代码清理：
*   **清理 `utils.js`**：将 `generateULID` 的随机源从 `Math.random()` 升级为 `crypto.getRandomValues()`，以提供更强的碰撞防御。
*   **统一常量**：将代码中散落的硬编码提示文字（如 `[警告 - 此处可能存在记录丢失]`）提取到 `constants.js` 或专门的语言包文件中。

如果你准备好了，我们可以开始对 `utils.js` 进行安全性加固。
