这是一个典型的引用错误。在上一阶段的修改中，我们在 `main.js` 的 `updateServer` 函数里直接使用了 `storage` 对象和 `migrateV5toV6` 函数，但忘记在文件顶部导入它们。

我将立即生成修复计划。

## [WIP] fix: add missing imports for storage and migration in main.js

### 错误分析

**问题**: 浏览器抛出 `Uncaught ReferenceError: storage is not defined`。
**原因**: 在 `src/main.js` 中使用了 `storage.getMessages()` 和 `migrateV5toV6()`，但该文件并未从 `src/storage.js` 导入 `storage` 对象，也未从 `src/state.js` 导入 `migrateV5toV6` 函数。由于 JavaScript 模块化的限制，这些未定义的引用导致了运行时崩溃。

### 用户需求
修复 `main.js` 中的引用错误，确保服务器检测和数据迁移逻辑能够正常运行。

### 评论
这是一个在重构过程中常见的疏忽。当我们将逻辑从一个模块移动或扩展到另一个模块时，必须确保所有依赖项都已正确声明。

### 目标
1. 在 `src/main.js` 中导入 `storage` 对象。
2. 在 `src/main.js` 中从 `src/state.js` 导入 `migrateV5toV6` 函数。

### 基本原理
通过在文件顶部添加 `import` 语句，将所需的依赖项引入当前模块的作用域，从而解决 `ReferenceError`。

### 标签
#intent/fix #flow/ready #priority/critical #comp/engine #scope/core #ai/instruct #task/domain/storage #task/object/v6-migration #task/action/bug-fix #task/state/continue

---

### Script

#### Acts 1: 补全 `main.js` 的导入语句

我们需要导入 `storage` 和 `migrateV5toV6`。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import './style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import {
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_WARNING_THRESHOLD_MB,
} from './constants.js';
import {
  extractServerFromDOM,
  extractUsefulData,
  findActiveTabByClass,
  locateChatElements,
} from './parser.js';
import {
  addMessageToSyntheticChannelIfNeeded,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  saveMessagesToStorage,
} from './state.js';
import { createUI } from './ui/index.js';
~~~~~
~~~~~javascript.new
import './style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import {
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_WARNING_THRESHOLD_MB,
} from './constants.js';
import {
  extractServerFromDOM,
  extractUsefulData,
  findActiveTabByClass,
  locateChatElements,
} from './parser.js';
import {
  addMessageToSyntheticChannelIfNeeded,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  migrateV5toV6,
  saveMessagesToStorage,
} from './state.js';
import { storage } from './storage.js';
import { createUI } from './ui/index.js';
~~~~~

### 下一步建议
- **立即刷新页面**: 检查控制台是否还存在 `ReferenceError`。
- **验证迁移弹窗**: 进入游戏并确保检测到服务器后，迁移对话框能够正确弹出。
- **检查 UI 状态同步**: 迁移完成后，UI 应该立即刷新并显示从 V5 导入的数据。
