好的，我们继续进行模块化拆分。这是代码重构中非常有价值的一步，它能显著提高代码的可读性和可维护性。

---

## [WIP] refactor: 提取常量和通用工具函数至独立模块

### 用户需求
将 `src/main.js` 文件中的全局常量和通用的辅助函数（如 `debounce`, `getISOTimestamp` 等）分别提取到 `src/constants.js` 和 `src/utils.js` 中，并在主文件中通过 `import` 引入它们。

### 评论
这是典型的代码重构实践。通过将“配置”（常量）和“工具”（函数）分离，我们的主文件 `main.js` 将更专注于业务流程和逻辑编排，这使得整个代码库的结构更加清晰和合理。

### 目标
1.  创建一个 `src/constants.js` 文件，用于存放所有全局常量。
2.  创建一个 `src/utils.js` 文件，用于存放与 DOM 无关的、可复用的工具函数。
3.  修改 `src/main.js`，移除已提取的代码，并通过 ES Module `import` 语句来使用这些新模块。

### 基本原理
利用 ES Modules 的 `export` 和 `import` 语法，我们可以将代码逻辑分散到多个文件中。Vite 会在构建时自动处理这些依赖关系，将它们“捆绑”回一个可在油猴环境中运行的单文件脚本，同时保持开发时的模块化优势。

### 标签
#intent/refine #flow/ready #priority/high #comp/build #concept/state #scope/core #ai/instruct #task/domain/refactoring #task/object/modularity #task/action/extraction #task/state/continue

---

### Script

#### Acts 1: 创建常量模块

我们将所有硬编码的配置项集中到一个文件中，方便未来统一管理。

~~~~~act
write_file
src/constants.js
~~~~~
~~~~~javascript
// 全局配置与状态
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';

export const STORAGE_WARNING_THRESHOLD_MB = 3.5; // 存储警告阈值 (MB)

// 定义被视为主服务器的域名列表，以启用精细化解析
export const MAIN_SERVER_HOSTS = ['pony.town'];
~~~~~

#### Acts 2: 创建通用工具模块

这里存放的是与具体业务逻辑解耦的、纯粹的辅助函数。

~~~~~act
write_file
src/utils.js
~~~~~
~~~~~javascript
import { STORAGE_KEY_V5 } from './constants.js';

/**
 * 计算脚本在 localStorage 中的存储占用空间。
 * @returns {number} - 占用的空间大小，单位是 MB。
 */
export function getStorageUsageInMB() {
  const data = localStorage.getItem(STORAGE_KEY_V5);
  if (!data) return 0;
  // 使用 Blob 来精确计算字符串的字节大小
  const sizeInBytes = new Blob([data]).size;
  return sizeInBytes / (1024 * 1024);
}

/**
 * 防抖函数。
 * 当一个函数在短时间内被连续调用时，此函数可以确保它只在最后一次调用之后的一段“冷静期”后执行一次。
 * @param {Function} func - 需要进行防抖处理的函数。
 * @param {number} wait - “冷静期”的毫秒数。
 * @returns {Function} - 返回一个新的、经过防抖处理的函数。
 */
export function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

/** 获取当前时间的 ISO 8601 UTC 标准格式字符串。*/
export function getISOTimestamp() {
  return new Date().toISOString();
}

/** 在UI界面中，将ISO UTC时间字符串格式化为用户本地时区的可读格式。*/
export function formatISOTimeForDisplay(isoString) {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '日期无效';

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return '日期无效';
  }
}
~~~~~

#### Acts 3: 重构主入口文件

现在我们清理 `src/main.js`，让它依赖新创建的模块。

首先，在文件顶部添加 `import` 语句。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import './style.css';

(function() {
  'use strict';
~~~~~
~~~~~javascript.new
import './style.css';
import { STORAGE_KEY_V5, OLD_STORAGE_KEY_V4, SELF_NAME_KEY, STORAGE_WARNING_THRESHOLD_MB, MAIN_SERVER_HOSTS } from './constants.js';
import { getStorageUsageInMB, debounce, getISOTimestamp, formatISOTimeForDisplay } from './utils.js';

(function() {
  'use strict';
~~~~~

接着，移除旧的常量定义。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  'use strict';

  // --- 全局配置与状态 ---
  const STORAGE_KEY_V5 = 'chatLogArchive_v5';
  const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
  const SELF_NAME_KEY = 'chatLogArchiver_selfName';

  const STORAGE_WARNING_THRESHOLD_MB = 3.5; // 存储警告阈值 (MB)

  // 定义被视为主服务器的域名列表，以启用精细化解析
  const MAIN_SERVER_HOSTS = ['pony.town'];

  // 内存缓存，作为脚本运行期间所有聊天记录的单一数据源
~~~~~
~~~~~javascript.new
  'use strict';

  // --- 全局配置与状态 ---
  // 内存缓存，作为脚本运行期间所有聊天记录的单一数据源
~~~~~

然后，移除 `getStorageUsageInMB` 函数。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /**
   * 计算脚本在 localStorage 中的存储占用空间。
   * @returns {number} - 占用的空间大小，单位是 MB。
   */
  function getStorageUsageInMB() {
    const data = localStorage.getItem(STORAGE_KEY_V5);
    if (!data) return 0;
    // 使用 Blob 来精确计算字符串的字节大小
    const sizeInBytes = new Blob([data]).size;
    return sizeInBytes / (1024 * 1024);
  }

  /*
~~~~~
~~~~~javascript.new
  /*
~~~~~

最后，移除 `debounce` 和时间格式化函数。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /*
   * =================================================================
   * 核心功能模块
   * =================================================================
   */

  /**
   * 防抖函数。
   * 当一个函数在短时间内被连续调用时，此函数可以确保它只在最后一次调用之后的一段“冷静期”后执行一次。
   * @param {Function} func - 需要进行防抖处理的函数。
   * @param {number} wait - “冷静期”的毫秒数。
   * @returns {Function} - 返回一个新的、经过防抖处理的函数。
   */
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }

  // --- 时间与数据格式化 ---

  /** 获取当前时间的 ISO 8601 UTC 标准格式字符串。*/
  function getISOTimestamp() {
    return new Date().toISOString();
  }

  /** 在UI界面中，将ISO UTC时间字符串格式化为用户本地时区的可读格式。*/
  function formatISOTimeForDisplay(isoString) {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '日期无效';

      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');

      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (e) {
      return '日期无效';
    }
  }

  // --- DOM 解析 ---
~~~~~
~~~~~javascript.new
  /*
   * =================================================================
   * 核心功能模块
   * =================================================================
   */

  // --- DOM 解析 ---
~~~~~

### 下一步建议
- **验证功能**: 请运行 `npm run watch`，然后刷新 PonyTown 页面，确保所有功能（UI、日志记录、存储计算等）仍然正常工作。
- **拆分解析器 (Parser)**: 下一步，我们可以将所有与 DOM 解析相关的函数（如 `isCharacterInPrivateUseArea`, `customTextContent`, `extractUsefulData`）提取到 `src/parser.js` 中。这将是最大、也是最有价值的一块拆分。

**测试通过后请告诉我，我们继续进行下一步。**
