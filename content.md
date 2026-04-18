简要回答：
找到崩溃原因了。在早前的代码重构中，`ChatMonitor` 类忘记在 `main.js` 中导入；同时在服务器变更时触发的 `updateServer` 函数里，仍试图访问早前被重构进 `ChatMonitor` 类的旧全局变量 `currentActiveChannel`，这直接导致了 `ReferenceError` 并造成主脚本挂掉（也就是为什么其他 observer 也会看起来全盘失效）。我们马上修复导入和变量引用，并为你补充上服务器提取的测试。

## [WIP] fix: 修复 main.js 中的未定义变量并补充 parser 测试

### 错误分析

应用启动并记录到 `[Archiver] Detected server switch: Safe Chinese` 后崩溃，报错 `ReferenceError: currentActiveChannel is not defined` 以及后续的 `ChatMonitor is not defined`。
1. **ChatMonitor 未引入**：在拆分 `main.js` 时，忘记了在 `main.js` 头部导入 `ChatMonitor` 类。
2. **变量作用域错误**：在 `updateServer` 函数内调用了未定义的 `currentActiveChannel`。该变量在此前的重构中被移入了 `ChatMonitor` 实例，导致在尝试更新 UI 状态时发生 `ReferenceError` 并阻断了整个 `main` 函数执行，从而导致所有的观察者都没能被正确初始化或启动。

### 用户需求
1. 修复启动过程中的 ReferenceError 异常。
2. 修复所有 Observer 失效的问题（实际上是由主程序崩溃引起，修复异常即可）。
3. 由于提取服务器名（`extractServerFromDOM`）逻辑对入口非常关键且容易出问题，需要为它添加单元测试以防止后续退化。

### 评论
主进程抛出未捕获异常导致页面逻辑短路是造成“所有观察者失效”的根本原因。补充缺少的导入包和修正变量引用即可快速修复。同时，补充 `parser.js` 测试有助于巩固现有提取逻辑（特别是 fallback 逻辑）的稳定性。

### 目标
1. 在 `main.js` 中引入 `ChatMonitor`。
2. 在 `main.js` 的 `updateServer` 函数中，将 `currentActiveChannel` 修正为安全获取 `chatMonitor ? chatMonitor.currentActiveChannel : null`。
3. 在 `tests/parser.test.js` 中补充 `extractServerFromDOM` 的相关单元测试。

### 基本原理
通过修改缺失的导入和调整状态的访问途径来恢复主进程的正确运行；通过测试驱动的方式固化对从 DOM 提取服务器名的各种不同结构的用例覆盖，保证其健壮性。

### 标签
#intent/fix #flow/ready #priority/critical #comp/runtime #comp/tests #concept/executor #scope/core #ai/instruct #task/domain/runtime #task/object/main-loop #task/action/bug-fix #task/state/begin

---

### Script

#### Acts 1: 修复 main.js 导入及变量引用

我们在文件头部导入 `ChatMonitor`，并修正 `updateServer` 内部对记录频道的访问。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import { generateULID } from './utils.js';
import { debounce, getISOTimestamp } from './utils.js';

(async () => {
~~~~~
~~~~~javascript.new
import { generateULID } from './utils.js';
import { ChatMonitor } from './monitor.js';
import { debounce, getISOTimestamp } from './utils.js';

(async () => {
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
        await storageManager.setLastServer(server); // 持久化缓存

        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
        }

        // 检查并触发交互式迁移 (如 v5 -> v6)
~~~~~
~~~~~javascript.new
        await storageManager.setLastServer(server); // 持久化缓存

        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, chatMonitor ? chatMonitor.currentActiveChannel : null);
        }

        // 检查并触发交互式迁移 (如 v5 -> v6)
~~~~~

#### Acts 2: 补充 parser.test.js 的测试

向 Parser 测试模块补充对应不同类型按钮和文本结构的 `extractServerFromDOM` 测试用例。

~~~~~act
patch_file
tests/parser.test.js
~~~~~
~~~~~javascript.old
import { describe, expect, it } from 'vitest';
import { extractUsefulData, findActiveTabByClass } from '../src/parser.js';

describe('Parser Module', () => {
~~~~~
~~~~~javascript.new
import { describe, expect, it } from 'vitest';
import { extractServerFromDOM, extractUsefulData, findActiveTabByClass } from '../src/parser.js';

describe('Parser Module', () => {
  describe('extractServerFromDOM', () => {
    it('应当能从带有 span 的按钮中提取服务器名', () => {
      document.body.innerHTML = '<button class="btn-success"><span> Safe Chinese </span></button>';
      expect(extractServerFromDOM()).toBe('Safe Chinese');
    });

    it('应当能通过 fallback 提取没有 span 的 Play on 按钮', () => {
      document.body.innerHTML = '<button class="btn-success">Play on Safe Chinese </button>';
      expect(extractServerFromDOM()).toBe('Safe Chinese');
    });

    it('如果没有目标按钮或匹配失败应返回 null', () => {
      document.body.innerHTML = '<button class="btn-primary">Other</button>';
      expect(extractServerFromDOM()).toBeNull();

      document.body.innerHTML = '<button class="btn-success">Invalid Text</button>';
      expect(extractServerFromDOM()).toBeNull();
    });
  });

~~~~~

### 下一步建议

由于之前直接导致崩溃阻断了其他流程，修复并更新单元测试后，建议运行 `npm run test` 以验证我们添加的 `parser.test.js` 用例是否能完全跑通。如果你认为改动已足够完整，可以创建 `[COMMIT]` 计划提交。
