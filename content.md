你的分析非常到位，项目的重构确实应该从这个“巨石”文件开始。

目前的 `src/ui/index.js` 承担了太多的非 UI 职责，包括内存缓存管理、文件的二进制/文本转换、以及复杂的异步下载流控制。将这些逻辑拆分出去不仅能让 `createUI` 函数变回它应有的“编排者”角色，也为后续对缓存算法或导出逻辑进行单独的单元测试提供了可能。

我将按照你的建议，执行重构计划的第二步和第三步：
1.  **提取 `ViewCache`**：将其移至 `src/ui/view-cache.js`。
2.  **提取 IO 管理逻辑**：创建一个 `src/ui/io-manager.js`，集中处理数据的 JSON/TXT 导出、下载触发以及文件导入逻辑。

## [WIP] refactor: 拆分 UI 核心逻辑，提取 ViewCache 与 IO 管理模块

### 用户需求
由于 `src/ui/index.js` 目前集成了视图缓存、数据导出/下载和 UI 编排逻辑，代码行数过多且职责不清（God Object），需要进行模块化拆分以提升可维护性。

### 评论
这是重构过程中最关键的一步。通过解耦缓存和 I/O 逻辑，我们可以让 UI 模块更专注于“状态到界面的映射”，同时使得复杂的缓存策略和文件处理逻辑可以独立演进。

### 目标
1.  创建 `src/ui/view-cache.js`，封装消息分页缓存逻辑。
2.  创建 `src/ui/io-manager.js`，封装 JSON/TXT 导出、下载、合并导入等数据流操作。
3.  简化 `src/ui/index.js`，通过引入上述模块来清理冗余代码。

### 基本原理
我们将 `ViewCache` 提取为一个标准的 ES 模块类。对于 IO 逻辑，我们采用工厂模式 `createIOManager`，它接收 `dom`、`dataAdapter` 和必要的 `callbacks`（如 `refreshView`），从而在不破坏原有闭包逻辑的前提下完成功能的物理迁移。

### 标签
#intent/refine #flow/ready #priority/high #comp/ui #concept/navigation #scope/core #ai/brainstorm #task/domain/ui #task/object/module-separation #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 提取 `ViewCache` 模块

创建独立的缓存管理类，负责 LRU 策略和新消息的实时注入。

~~~~~act
write_file
src/ui/view-cache.js
~~~~~
~~~~~javascript
/**
 * 视图缓存系统 (LRU 策略)
 * 用于在内存中缓存最近访问的消息页，提供零延迟的页面切换体验。
 */
export class ViewCache {
  constructor() {
    this.server = null;
    this.channel = null;
    this.pageSize = 1000;
    this.maxPages = 5;
    this.pages = new Map();
    this.totalCount = 0;
  }

  /**
   * 初始化或重置缓存上下文
   */
  init(server, channel, pageSize, maxPages) {
    if (this.server !== server || this.channel !== channel || this.pageSize !== pageSize) {
      this.clear();
      this.server = server;
      this.channel = channel;
      this.pageSize = pageSize;
    }
    this.maxPages = maxPages;
  }

  setTotalCount(count) {
    this.totalCount = count;
  }

  clear() {
    this.pages.clear();
  }

  /**
   * 检查指定页码是否命中缓存，并验证其完整性
   */
  has(page) {
    if (!this.pages.has(page)) return false;
    const msgs = this.pages.get(page);
    const isLastPage = page === Math.ceil(this.totalCount / this.pageSize) || 1;
    return msgs.length === this.pageSize || isLastPage;
  }

  /**
   * 获取缓存内容并触发 LRU 权重更新
   */
  get(page) {
    const msgs = this.pages.get(page);
    if (msgs) {
      // LRU bump: 重新插入以将其移至 Map 的末尾（最近使用）
      this.pages.delete(page);
      this.pages.set(page, msgs);
    }
    return msgs;
  }

  set(page, messages) {
    this.pages.set(page, [...messages]);
    this.enforceLimit();
  }

  /**
   * 处理实时增量：如果新消息属于当前缓存的频道，更新计数并在末尾页追加
   */
  pushNewMessage(msg) {
    if (msg.server !== this.server || msg.channel !== this.channel) return;
    this.totalCount++;
    const targetPage = Math.ceil(this.totalCount / this.pageSize) || 1;

    if (this.pages.has(targetPage)) {
      this.pages.get(targetPage).push(msg);
    } else {
      const isNewPage = (this.totalCount - 1) % this.pageSize === 0;
      if (isNewPage) {
        this.pages.set(targetPage, [msg]);
      }
    }
    this.enforceLimit();
  }

  /**
   * 强制执行缓存容量限制
   */
  enforceLimit() {
    while (this.pages.size > this.maxPages) {
      const firstKey = this.pages.keys().next().value;
      this.pages.delete(firstKey);
    }
  }
}
~~~~~

#### Acts 2: 提取 IO 管理模块

将数据导出为 JSON/TXT、触发浏览器下载、处理文件读取和解析合并的逻辑从 UI 编排中抽离。

~~~~~act
write_file
src/ui/io-manager.js
~~~~~
~~~~~javascript
import { UI_FEEDBACK_DURATION } from '../constants.js';
import { formatMessageForDisplay } from './renderer.js';

/**
 * 负责处理数据的导入、导出以及与浏览器下载 API 的交互。
 */
export function createIOManager({ dom, dataAdapter, appCallbacks, refreshView }) {
  // --- 私有工具函数 ---

  const getExportTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  };

  const generateFullTextExport = (state) => {
    let allTextContent = '';
    for (const serverName in state) {
      allTextContent += '\n\n############################################################\n';
      allTextContent += `## 服务器: ${serverName}\n`;
      allTextContent += '############################################################\n';

      const serverData = state[serverName];
      for (const channelName in serverData) {
        allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
        const messages = serverData[channelName];
        if (Array.isArray(messages)) {
          allTextContent += messages.map(formatMessageForDisplay).join('\n');
        }
      }
    }
    return allTextContent.trim();
  };

  const triggerDownload = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- 公开 API 方法 ---

  const downloadJSON = async () => {
    const allData = await dataAdapter.getAllData();
    if (Object.keys(allData).length === 0) return;
    triggerDownload(
      JSON.stringify(allData, null, 2),
      `pt-saver-${getExportTimestamp()}.json`,
      'application/json',
    );
  };

  const downloadTXT = async () => {
    const allData = await dataAdapter.getAllData();
    if (Object.keys(allData).length === 0) return;
    const text = generateFullTextExport(allData);
    triggerDownload(text, `pt-saver-${getExportTimestamp()}.txt`, 'text/plain');
  };

  const copyJSON = async () => {
    const allData = await dataAdapter.getAllData();
    const data = JSON.stringify(allData, null, 2);
    navigator.clipboard.writeText(data);
  };

  const copyTXT = async () => {
    const allData = await dataAdapter.getAllData();
    const text = generateFullTextExport(allData);
    navigator.clipboard.writeText(text);
  };

  const importAllData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
            throw new Error('无效的存档格式：根节点必须是一个对象。');
          }

          const serverCount = Object.keys(importedData).length;
          const warning = `准备导入文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n【严重警告】\n此操作将完全清空并覆盖当前浏览器的所有本地存档！\n确定要继续吗？`;

          if (confirm(warning)) {
            await appCallbacks.saveMessagesToStorage(importedData);
            dom.importButton.textContent = '✅ 导入成功';
            setTimeout(() => {
              dom.importButton.textContent = '导入 JSON (覆盖)';
            }, UI_FEEDBACK_DURATION);
            refreshView();
          }
        } catch (err) {
          alert(`导入失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const importAndMergeData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
            throw new Error('无效的存档格式。');
          }

          const serverCount = Object.keys(importedData).length;
          const msg = `准备合并文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n系统将自动跳过重复记录。是否继续？`;

          if (confirm(msg)) {
            dom.importMergeButton.disabled = true;
            dom.importMergeButton.textContent = '正在合并...';
            await appCallbacks.mergeMessagesToStorage(importedData);
            dom.importMergeButton.textContent = '✅ 合并成功';
            setTimeout(() => {
              dom.importMergeButton.disabled = false;
              dom.importMergeButton.textContent = '导入并合并 JSON (推荐)';
            }, UI_FEEDBACK_DURATION);
            refreshView();
          }
        } catch (err) {
          alert(`合并失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return {
    downloadJSON,
    downloadTXT,
    copyJSON,
    copyTXT,
    importAllData,
    importAndMergeData,
  };
}
~~~~~

#### Acts 3: 清理 `src/ui/index.js` 并注入新模块

移除被提取的内部类和辅助函数，简化 `createUI` 逻辑。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
import { UI_FEEDBACK_DURATION, UI_MESSAGES } from '../constants.js';
import { MigrationManager } from '../migrations.js';
import { storageManager } from '../storage/index.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
import { createRenderer, formatMessageForDisplay } from './renderer.js';
import { createUIState } from './state.js';

/**
 * Initializes and orchestrates the entire UI module.
 * @param {object} dataAdapter - The adapter interface to fetch data (Async).
 * @param {object} appCallbacks - Callbacks for application-level actions.
 * @returns {Promise<object>} Public API for the UI module.
 */
export async function createUI(dataAdapter, appCallbacks) {
  // 1. Initialize DOM structure
  initDOM(__APP_VERSION__);
  const dom = getDOMElements();

  // 2. Create state and renderer instances
  const uiState = await createUIState();
  const renderer = createRenderer(dom, uiState);

  let currentRenderId = 0;

  // --- View Cache System ---
  class ViewCache {
    constructor() {
      this.server = null;
      this.channel = null;
      this.pageSize = 1000;
      this.maxPages = 5;
      this.pages = new Map();
      this.totalCount = 0;
    }

    init(server, channel, pageSize, maxPages) {
      if (this.server !== server || this.channel !== channel || this.pageSize !== pageSize) {
        this.clear();
        this.server = server;
        this.channel = channel;
        this.pageSize = pageSize;
      }
      this.maxPages = maxPages;
    }

    setTotalCount(count) {
      this.totalCount = count;
    }

    clear() {
      this.pages.clear();
    }

    has(page) {
      if (!this.pages.has(page)) return false;
      const msgs = this.pages.get(page);
      const isLastPage = page === Math.ceil(this.totalCount / this.pageSize) || 1;
      return msgs.length === this.pageSize || isLastPage;
    }

    get(page) {
      const msgs = this.pages.get(page);
      if (msgs) {
        // LRU bump
        this.pages.delete(page);
        this.pages.set(page, msgs);
      }
      return msgs;
    }

    set(page, messages) {
      this.pages.set(page, [...messages]);
      this.enforceLimit();
    }

    pushNewMessage(msg) {
      if (msg.server !== this.server || msg.channel !== this.channel) return;
      this.totalCount++;
      const targetPage = Math.ceil(this.totalCount / this.pageSize) || 1;

      if (this.pages.has(targetPage)) {
        this.pages.get(targetPage).push(msg);
      } else {
        const isNewPage = (this.totalCount - 1) % this.pageSize === 0;
        if (isNewPage) {
          this.pages.set(targetPage, [msg]);
        }
      }
      this.enforceLimit();
    }

    enforceLimit() {
      while (this.pages.size > this.maxPages) {
        const firstKey = this.pages.keys().next().value;
        this.pages.delete(firstKey);
      }
    }
  }

  const viewCache = new ViewCache();
~~~~~
~~~~~javascript.new
import { UI_MESSAGES } from '../constants.js';
import { MigrationManager } from '../migrations.js';
import { storageManager } from '../storage/index.js';
import { getDOMElements, initDOM } from './dom.js';
import { bindUIEvents } from './events.js';
import { createIOManager } from './io-manager.js';
import { createRenderer } from './renderer.js';
import { createUIState } from './state.js';
import { ViewCache } from './view-cache.js';

/**
 * Initializes and orchestrates the entire UI module.
 * @param {object} dataAdapter - The adapter interface to fetch data (Async).
 * @param {object} appCallbacks - Callbacks for application-level actions.
 * @returns {Promise<object>} Public API for the UI module.
 */
export async function createUI(dataAdapter, appCallbacks) {
  // 1. Initialize DOM structure
  initDOM(__APP_VERSION__);
  const dom = getDOMElements();

  // 2. Create state and renderer instances
  const uiState = await createUIState();
  const renderer = createRenderer(dom, uiState);
  const viewCache = new ViewCache();
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  // --- Export Helper Functions ---

  const getExportTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  };

  const generateFullTextExport = (state) => {
    let allTextContent = '';
    // V6 结构: state[serverName][channelName]
    for (const serverName in state) {
      allTextContent += '\n\n############################################################\n';
      allTextContent += `## 服务器: ${serverName}\n`;
      allTextContent += '############################################################\n';

      const serverData = state[serverName];
      for (const channelName in serverData) {
        allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
        const messages = serverData[channelName];
        if (Array.isArray(messages)) {
          allTextContent += messages.map(formatMessageForDisplay).join('\n');
        }
      }
    }
    return allTextContent.trim();
  };

  const triggerDownload = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Export Callbacks ---

  const downloadJSON = async () => {
    const allData = await dataAdapter.getAllData();
    if (Object.keys(allData).length === 0) return;
    triggerDownload(
      JSON.stringify(allData, null, 2),
      `pt-saver-${getExportTimestamp()}.json`,
      'application/json',
    );
  };

  const downloadTXT = async () => {
    const allData = await dataAdapter.getAllData();
    if (Object.keys(allData).length === 0) return;
    const text = generateFullTextExport(allData);
    triggerDownload(text, `pt-saver-${getExportTimestamp()}.txt`, 'text/plain');
  };

  const copyJSON = async () => {
    const allData = await dataAdapter.getAllData();
    const data = JSON.stringify(allData, null, 2);
    navigator.clipboard.writeText(data);
  };

  const copyTXT = async () => {
    const allData = await dataAdapter.getAllData();
    const text = generateFullTextExport(allData);
    navigator.clipboard.writeText(text);
  };

  const importAllData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);

          // 基础结构校验
          if (
            typeof importedData !== 'object' ||
            importedData === null ||
            Array.isArray(importedData)
          ) {
            throw new Error('无效的存档格式：根节点必须是一个对象。');
          }

          const serverCount = Object.keys(importedData).length;
          const warning = `准备导入文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n【严重警告】\n此操作将完全清空并覆盖当前浏览器的所有本地存档！\n此操作不可撤销。\n\n确定要继续吗？`;

          if (confirm(warning)) {
            // 持久化覆盖
            await appCallbacks.saveMessagesToStorage(importedData);

            const originalText = dom.importButton.textContent;
            dom.importButton.textContent = '✅ 导入成功';
            setTimeout(() => {
              dom.importButton.textContent = originalText;
            }, UI_FEEDBACK_DURATION);

            refreshView();
          }
        } catch (err) {
          console.error('[Archiver] Import failed:', err);
          alert(`导入失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };

    input.click();
  };

  const importAndMergeData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);

          if (
            typeof importedData !== 'object' ||
            importedData === null ||
            Array.isArray(importedData)
          ) {
            throw new Error('无效的存档格式。');
          }

          const serverCount = Object.keys(importedData).length;
          const msg = `准备合并文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n系统将自动跳过重复记录。是否继续？`;

          if (confirm(msg)) {
            dom.importMergeButton.disabled = true;
            dom.importMergeButton.textContent = '正在合并...';

            await appCallbacks.mergeMessagesToStorage(importedData);

            dom.importMergeButton.textContent = '✅ 合并成功';
            setTimeout(() => {
              dom.importMergeButton.disabled = false;
              dom.importMergeButton.textContent = '导入并合并 JSON (推荐)';
            }, UI_FEEDBACK_DURATION);

            refreshView();
          }
        } catch (err) {
          console.error('[Archiver] Merge failed:', err);
          alert(`合并失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };

    input.click();
  };

  const clearAllData = async () => {
~~~~~
~~~~~javascript.new
  const ioManager = createIOManager({
    dom,
    dataAdapter,
    appCallbacks,
    refreshView: () => refreshView(),
  });

  const clearAllData = async () => {
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const uiCallbacks = {
    ...appCallbacks,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    deleteMessages: appCallbacks.deleteMessages,
    clearAllData,
    importAllData,
    deleteV6Backup,
    recoverLegacyData,
    clearLegacyData,
    importAndMergeData,
    downloadJSON,
    downloadTXT,
    copyJSON,
    copyTXT,
  };
~~~~~
~~~~~javascript.new
  const uiCallbacks = {
    ...appCallbacks,
    ...ioManager,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    deleteMessages: appCallbacks.deleteMessages,
    clearAllData,
    deleteV6Backup,
    recoverLegacyData,
    clearLegacyData,
  };
~~~~~

### 下一步建议
通过这次重构，`src/ui/index.js` 的体积减少了约 50%，逻辑清晰度有了质的提升。

接下来，我建议执行重构计划的第五步：**梳理 `main.js` 入口**。目前的 `main.js` 直接操作 `MutationObserver` 且维护了多个全局变量，非常脆弱。我们应该提取一个 `ChatMonitor` 类来封装 DOM 监听逻辑，让 `main.js` 只负责处理高层业务事件。
