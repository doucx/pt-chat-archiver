这是一个由于测试数据不完整导致的回归错误。在 Phase 1 重构后，`createUI` 会立即触发首屏渲染。而测试用例 `当没有重复项时，点击按钮应当给出提示` 中构造的 Mock 数据缺少 `type` 字段，导致 `formatMessageForDisplay` 在尝试调用 `msg.type.includes()` 时抛出异常。

我将生成一个计划来增强渲染器的健壮性，并修正测试用例中的 Mock 数据。

## [WIP] fix(ui): 增强消息格式化程序的健壮性并修复测试数据

### 错误分析
1.  **健壮性缺失**: `src/ui/renderer.js` 中的 `formatMessageForDisplay` 函数假定所有消息对象都具有 `type` 属性。
2.  **Mock 数据不完整**: `tests/ui.clean_duplicates.test.js` 中的一个测试用例构造了一个只有 `content` 和 `time` 的简化消息对象，这在之前的同步架构中可能未被立即渲染，但在现在的异步初始化流程中触发了渲染异常。

### 用户需求
修复 `TypeError: Cannot read properties of undefined (reading 'includes')` 错误，确保 UI 能够安全处理不完整或非标的消息数据。

### 评论
虽然理想情况下所有数据都应符合 Schema，但在处理历史导入或人工构造的测试数据时，渲染器应当具备基本的防御性编程能力。

### 目标
1.  修改 `src/ui/renderer.js`，在访问 `msg.type` 前进行存在性检查。
2.  修正 `tests/ui.clean_duplicates.test.js` 中的测试数据，使其符合标准消息结构。

### 基本原理
通过在 `formatMessageForDisplay` 中使用逻辑或 `|| ''` 确保 `msg.type` 始终为一个字符串，从而避免调用 `.includes()` 时崩溃。同时修正测试数据以反映真实的数据结构。

### 标签
#intent/fix #flow/ready #priority/medium #comp/ui #comp/tests #scope/core #ai/instruct #task/domain/ui #task/object/renderer #task/action/bug-fix #task/state/end #task/status/completed

---

### Script

#### Acts 1: 增强渲染器的防御性

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~old
export function formatMessageForDisplay(msg) {
  let prefix = '';
  if (msg.type.includes('party')) prefix = '👥 ';
  else if (msg.type.includes('whisper')) prefix = '💬 ';
  else if (msg.type.includes('announcement')) prefix = '📣 ';
~~~~~
~~~~~new
export function formatMessageForDisplay(msg) {
  let prefix = '';
  const type = msg.type || '';
  if (type.includes('party')) prefix = '👥 ';
  else if (type.includes('whisper')) prefix = '💬 ';
  else if (type.includes('announcement')) prefix = '📣 ';
~~~~~

#### Acts 2: 修正测试用例中的 Mock 数据

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~old
  it('当没有重复项时，点击按钮应当给出提示', async () => {
    // 构造一个没有重复的状态
    const cleanState = { S1: { L1: [{ content: 'unique', time: new Date().toISOString() }] } };
    const adapter = createMockAdapter(cleanState);
~~~~~
~~~~~new
  it('当没有重复项时，点击按钮应当给出提示', async () => {
    // 构造一个没有重复的状态，增加缺失的 type 字段
    const cleanState = {
      S1: { L1: [{ content: 'unique', time: new Date().toISOString(), type: 'say' }] },
    };
    const adapter = createMockAdapter(cleanState);
~~~~~
