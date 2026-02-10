你的分析非常深刻。目前的代码中，`localStorage` 的交互逻辑像“硬连接”一样散落在各个模块中，这不仅导致了 `STORAGE_KEY_V5` 被多次硬编码，也使得未来向 `V6` 结构迁移或引入 `IndexedDB` 变得异常困难。

引入一个专门的 `storage.js` 抽象层是实现 v6 路线图最关键的“隐形前提”。这将把“数据是什么（逻辑）”与“数据怎么存（持久化）”彻底解耦。

我将生成一个计划来实施这一重构。

## [WIP] refactor: 实现存储层封装以消除硬编码的 localStorage 交互

### 用户需求
消除项目中散落在各处的硬编码 `localStorage` 调用和 `STORAGE_KEY_V5` 引用，通过建立统一的存储抽象层 (`storage.js`) 来提升代码的可维护性，并为后续 v6 版本的架构升级奠定基础。

### 评论
这是一个典型的“技术债偿还”操作。在功能演进（如 v6 的服务器感知）之前，清理基础设施能显著降低后续开发的出错率。通过封装，我们可以集中处理序列化错误、版本检查和存储配额监控。

### 目标
1.  **新建 `src/storage.js`**: 作为一个单例或一组工具函数，封装所有与 `localStorage` 的交互。
2.  **统一 API**: 提供针对消息 (`Messages`)、配置 (`Config`) 和身份 (`SelfName`) 的 CRUD 接口。
3.  **重构现有模块**: 修改 `state.js`, `ui/state.js`, `utils.js`, `ui/index.js` 和 `main.js`，使其通过新 API 访问数据。
4.  **保留 V5 逻辑**: 当前重构必须保证对 V5 数据的读写行为完全一致，不触发任何架构变更。

### 基本原理
我们采用 **Repository 模式** 的简化版。`storage.js` 知道所有的 `Key` 和存储格式。其他模块只需表达意图（如 `storage.getMessages()`），而无需关心底层使用的是哪个 `STORAGE_KEY` 或是否涉及 `JSON.parse`。这为以后将 `V5` 替换为 `V6` 提供了一个“单一切换点”。

### 标签
#intent/refine #flow/ready #priority/high #comp/engine #concept/state #concept/config #scope/core #ai/instruct #task/domain/storage #task/object/storage-wrapper #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 创建存储抽象层 `src/storage.js`

我们将把所有与 `localStorage` 相关的键值管理和基础读写逻辑移入此文件。

~~~~~act
write_file
src/storage.js
~~~~~
~~~~~javascript
import { CONFIG_KEY, OLD_STORAGE_KEY_V4, SELF_NAME_KEY, STORAGE_KEY_V5 } from './constants.js';

/**
 * 核心存储驱动，封装对 localStorage 的直接访问。
 */
export const storage = {
  // --- 聊天记录 (Messages) ---
  getMessages() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_V5);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('[Storage] 解析 V5 存档失败:', e);
      return {};
    }
  },

  saveMessages(messagesObject) {
    try {
      localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(messagesObject));
    } catch (e) {
      console.error('[Storage] 保存 V5 存档失败:', e);
    }
  },

  clearAllMessages() {
    localStorage.removeItem(STORAGE_KEY_V5);
  },

  /** 返回存档的原始字节大小（用于容量计算） */
  getMessagesRawSize() {
    const data = localStorage.getItem(STORAGE_KEY_V5);
    return data ? new Blob([data]).size : 0;
  },

  // --- 配置 (Config) ---
  getConfig() {
    const defaultCfg = { pageSize: 1000 };
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      return stored ? { ...defaultCfg, ...JSON.parse(stored) } : defaultCfg;
    } catch (e) {
      return defaultCfg;
    }
  },

  saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  },

  // --- 用户身份 (SelfName) ---
  getSelfName() {
    return localStorage.getItem(SELF_NAME_KEY) || '';
  },

  setSelfName(name) {
    localStorage.setItem(SELF_NAME_KEY, name.trim());
  },

  // --- 迁移相关 (Legacy V4) ---
  getLegacyV4Data() {
    const data = localStorage.getItem(OLD_STORAGE_KEY_V4);
    return data ? JSON.parse(data) : null;
  },

  removeLegacyV4Data() {
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
  },
};
~~~~~

#### Acts 2: 重构 `src/state.js` 以使用存储层

我们将移除 `state.js` 中直接访问 `localStorage` 的逻辑，并更新其导出的函数。

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
import { OLD_STORAGE_KEY_V4, STORAGE_KEY_V5 } from './constants.js';
import { getISOTimestamp } from './utils.js';

/**
 * 检查并执行一次性的数据迁移，将 v4 版本的数据转换为 v5 格式。
 */
export function migrateDataV4toV5() {
  const oldDataRaw = localStorage.getItem(OLD_STORAGE_KEY_V4);
  if (!oldDataRaw) return;

  console.log('检测到旧版本(v4)数据，正在执行一次性迁移...');
  try {
    const oldData = JSON.parse(oldDataRaw);
    const newData = {};

    for (const channel in oldData) {
      newData[channel] = oldData[channel].map((msg) => {
        const newMsg = { ...msg };
        try {
          const localDate = new Date(msg.time.replace(/-/g, '/'));
          newMsg.time = localDate.toISOString();
        } catch (e) {
          newMsg.time = new Date().toISOString();
        }
        newMsg.is_historical = true;
        return newMsg;
      });
    }

    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(newData));
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
    console.log('数据迁移成功！');
  } catch (error) {
    console.error('数据迁移失败，旧数据可能已损坏，将予以保留。', error);
  }
}
~~~~~
~~~~~javascript.new
import { storage } from './storage.js';
import { getISOTimestamp } from './utils.js';

/**
 * 检查并执行一次性的数据迁移，将 v4 版本的数据转换为 v5 格式。
 */
export function migrateDataV4toV5() {
  try {
    const oldData = storage.getLegacyV4Data();
    if (!oldData) return;

    console.log('检测到旧版本(v4)数据，正在执行一次性迁移...');
    const newData = {};

    for (const channel in oldData) {
      newData[channel] = oldData[channel].map((msg) => {
        const newMsg = { ...msg };
        try {
          const localDate = new Date(msg.time.replace(/-/g, '/'));
          newMsg.time = localDate.toISOString();
        } catch (e) {
          newMsg.time = new Date().toISOString();
        }
        newMsg.is_historical = true;
        return newMsg;
      });
    }

    storage.saveMessages(newData);
    storage.removeLegacyV4Data();
    console.log('数据迁移成功！');
  } catch (error) {
    console.error('数据迁移失败，旧数据可能已损坏，将予以保留。', error);
  }
}
~~~~~
~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
/** 从 localStorage 加载存档。*/
export function loadMessagesFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_V5)) || {};
  } catch (e) {
    console.error('读取存档失败，数据已损坏。', e);
    return {};
  }
}

/** 将内存中的存档保存到 localStorage。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到 localStorage');
  localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(messagesObject));
}
~~~~~
~~~~~javascript.new
/** 从持久化层加载存档。*/
export function loadMessagesFromStorage() {
  return storage.getMessages();
}

/** 将内存中的存档保存到持久化层。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到本地存储');
  storage.saveMessages(messagesObject);
}
~~~~~

#### Acts 3: 重构 UI 状态管理 `src/ui/state.js`

更新 UI 内部配置的读写逻辑。

~~~~~act
patch_file
src/ui/state.js
~~~~~
~~~~~javascript.old
import { CONFIG_KEY, SELF_NAME_KEY } from '../constants.js';

/**
 * Creates and manages the UI's internal state.
 * @returns {object} A UI state manager instance.
 */
export function createUIState() {
  const state = {
    currentPage: 1,
    pageSize: 1000,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
  };

  const loadConfig = () => {
    const defaultCfg = { pageSize: 1000 };
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      const parsed = stored ? { ...defaultCfg, ...JSON.parse(stored) } : defaultCfg;
      state.pageSize = parsed.pageSize;
    } catch (e) {
      // Use default if config is corrupt
    }
  };

  const saveConfig = () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ pageSize: state.pageSize }));
  };

  // Initial load
  loadConfig();

  return {
    getState: () => ({ ...state }),

    setPage: (page) => {
      state.currentPage = Math.max(1, Math.min(page, state.totalPages));
    },
    setTotalPages: (total) => {
      state.totalPages = Math.max(1, total);
    },
    setViewMode: (mode) => {
      if (['log', 'stats', 'config'].includes(mode)) {
        state.viewMode = mode;
      }
    },
    setPageSize: (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        saveConfig();
      }
    },
    togglePause: () => {
      state.isUIPaused = !state.isUIPaused;
      return state.isUIPaused;
    },
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
    getSelfName: () => localStorage.getItem(SELF_NAME_KEY) || '',
    setSelfName: (name) => localStorage.setItem(SELF_NAME_KEY, name.trim()),
  };
}
~~~~~
~~~~~javascript.new
import { storage } from '../storage.js';

/**
 * Creates and manages the UI's internal state.
 * @returns {object} A UI state manager instance.
 */
export function createUIState() {
  const state = {
    currentPage: 1,
    pageSize: 1000,
    totalPages: 1,
    viewMode: 'log', // 'log' | 'stats' | 'config'
    isUIPaused: false,
  };

  const loadConfig = () => {
    const config = storage.getConfig();
    state.pageSize = config.pageSize;
  };

  const saveConfig = () => {
    storage.saveConfig({ pageSize: state.pageSize });
  };

  // Initial load
  loadConfig();

  return {
    getState: () => ({ ...state }),

    setPage: (page) => {
      state.currentPage = Math.max(1, Math.min(page, state.totalPages));
    },
    setTotalPages: (total) => {
      state.totalPages = Math.max(1, total);
    },
    setViewMode: (mode) => {
      if (['log', 'stats', 'config'].includes(mode)) {
        state.viewMode = mode;
      }
    },
    setPageSize: (size) => {
      const val = Number.parseInt(size, 10);
      if (!Number.isNaN(val) && val >= 10) {
        state.pageSize = val;
        saveConfig();
      }
    },
    togglePause: () => {
      state.isUIPaused = !state.isUIPaused;
      return state.isUIPaused;
    },
    forcePause: (paused) => {
      state.isUIPaused = paused;
    },
    getSelfName: () => storage.getSelfName(),
    setSelfName: (name) => storage.setSelfName(name),
  };
}
~~~~~

#### Acts 4: 更新 `src/utils.js` 和 `src/ui/index.js`

修正容量计算和清空操作。

~~~~~act
patch_file
src/utils.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
import { storage } from './storage.js';

/**
 * 计算脚本在 localStorage 中的存储占用空间。
 * @returns {number} - 占用的空间大小，单位是 MB。
 */
export function getStorageUsageInMB() {
  const sizeInBytes = storage.getMessagesRawSize();
  return sizeInBytes / (1024 * 1024);
}
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
import { STORAGE_KEY_V5 } from '../constants.js';
~~~~~
~~~~~javascript.new
import { storage } from '../storage.js';
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const clearAllData = () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      localStorage.removeItem(STORAGE_KEY_V5); // 使用常量
      for (const key of Object.keys(appState)) {
        delete appState[key];
      }
      appCallbacks.scanAndMergeHistory(); // This will repopulate appState
      appCallbacks.saveMessagesToStorage(appState);
      renderer.render(appState, uiCallbacks);
    }
  };
~~~~~
~~~~~javascript.new
  const clearAllData = () => {
    if (
      confirm(
        '【严重警告】此操作将清空所有本地存储的聊天存档，并以当前屏幕可见记录重置。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      storage.clearAllMessages();
      for (const key of Object.keys(appState)) {
        delete appState[key];
      }
      appCallbacks.scanAndMergeHistory(); // This will repopulate appState
      appCallbacks.saveMessagesToStorage(appState);
      renderer.render(appState, uiCallbacks);
    }
  };
~~~~~

### 下一步建议

我们已经成功建立了存储抽象层，现在整个项目对 `localStorage` 的底层细节已完全不可知。

**下一步建议：**
1.  **验证重构**: 运行脚本，确保现有的 V5 数据能正常加载，且新的记录能正确保存。
2.  **实施服务器感知**: 现在我们可以放心地在 `storage.js` 中引入 `STORAGE_KEY_V6` 并在其内部实现 V5 到 V6 的逻辑转换，而无需修改 UI 或解析器的逻辑。
3.  **完善 `main.js`**: 此时可以按照路线图，在 `main.js` 中利用解析器获取服务器名称，并开始尝试将其传递给存储层。
