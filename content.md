你的分析非常准确。当前的错误完全源于重构的过渡态：Preact 组件 (`App.jsx`) 和旧版的 Vanilla DOM (`templates.js`) 被同时挂载在了页面上，导致两套 UI（和大量相同 id 的 DOM）发生了叠加冲突。集成测试中的 `getByRole` 和 `getByTitle` 因为找到了多个重复元素而触发了断言错误和超时。为了让重构过程平稳，并在完全接管前保持测试环境的一致性，我将为 `App.jsx` 引入一个 Feature Flag (特性开关) 安全锁。

## [WIP] fix(ui): 临时屏蔽 Preact App 的挂载以解决双重 UI 冲突和测试失败

### 错误分析

测试日志中明确指出了所有的失败根源：
1. **`Found multiple elements with the role "textbox"`**: `templates.js` 中的旧版 `<textarea>` 和 `LogViewer.jsx` 中新版的 `<textarea>` 同时存在于 DOM 树中。
2. **切换视图/分页设置测试的超时失败**: 由于页面上存在两个“设置”按钮，测试可能捕获到了错误的对象，或者是由于触发了 Preact 的局部 Signal 更新而没有触发旧版 `refreshView()` 中的 DOM 控制逻辑，导致视图显示状态不符合测试期望。

### 用户需求

修复所有 UI 集成测试的失败，确保能够继续平稳地推进 Preact 的重构路线图，而不会在这个中间过渡期内破坏现有功能的可用性。

### 评论

这是一个在“渐进式重构”中非常经典的场景。我们在引入新架构的同时必须兼容旧体系，直到新架构 100% 准备就绪。引入一个 `Feature Flag` (特性开关) 来隔离正在开发中的组件，是比直接修改底层测试代码更优雅、也更符合工程规范的做法。

### 目标

1. 在 `App.jsx` 的渲染入口添加一个控制开关 `IS_PREACT_READY`。
2. 在该开关开启前（即 ConfigPanel 等未完成前），临时让组件返回 `null` 以阻止其渲染到真实 DOM 树中。
3. 消除由于双重渲染导致的元素定位冲突，使所有的集成测试恢复通过状态。

### 基本原理

通过在顶层返回 `null`，我们能够在保留已有 Preact 信号和钩子流转的同时，切断其向真实的浏览器 DOM 输出的通路。这使得 `Testing Library` 看到的又变回了一个纯净的、由 `templates.js` 驱动的单层 DOM，从而立刻消除由于“找到了多个组件”而引发的所有崩溃。

### 标签

#intent/fix #flow/ready #priority/high #comp/ui #concept/ui #scope/ui #ai/instruct #task/domain/ui #task/object/preact-migration #task/action/fix #task/state/continue

---

### Script

#### Acts 1: 在 App.jsx 中引入特性开关

我们将利用 `patch_file` 巧妙地在 `App` 组件的出口处增加拦截逻辑。

~~~~~act
patch_file
src/ui/App.jsx
~~~~~
~~~~~javascript.old
    }
  };

  return (
    <div 
      className={`log-archive-app-root ${isReadOnly.value ? 'is-readonly' : ''}`}
~~~~~
~~~~~javascript.new
    }
  };

  // [重构开关]: 临时禁用 Preact 渲染，避免在过渡期与旧版 Vanilla DOM 发生冲突并破坏集成测试。
  // 在完成 ConfigPanel 和 StatsView 的重构，并准备好移除 templates.js 之前，请保持为 false。
  const IS_PREACT_READY = false;

  if (!IS_PREACT_READY) {
    return null;
  }

  return (
    <div 
      className={`log-archive-app-root ${isReadOnly.value ? 'is-readonly' : ''}`}
~~~~~

### 下一步建议

在此计划执行后，所有的 UI 冒烟测试应该就会立刻变绿了。
你可以安全地提交这个补丁，随后我们将可以专注于**阶段三的下一步**：继续利用 Signals 和现有的样式补齐 `<ConfigPanel />` 组件，一旦全部原子组件编写完成，我们就能将 `IS_PREACT_READY` 设为 `true`，并彻底删除旧版的 `templates.js` 等冗余文件！
