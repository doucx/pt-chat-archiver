你的分析非常深刻且具有前瞻性。

在 v5 升级 v6 的过程中，直接在各处硬编码 `localStorage.getItem(STORAGE_KEY_V6)` 不仅会导致代码难以维护，更会使得未来的存储扩展（如迁移到 IndexedDB 以突破 5MB 限制）变得异常困难。

引入一个**单例存储服务 (Storage Service)** 是标准的工程化实践。它将作为系统的“数据网关”，负责处理序列化、错误处理、键名管理以及存储容量监控。

我将生成一个计划来实施这一封装。

## [WIP] feat: 引入存储抽象层 (Storage Service) 以消除硬编码并支持 v6 架构

### 用户需求
需要通过创建一个统一的存储封装模块（Storage Service）来消除代码中对 `localStorage` 和具体 `STORAGE_KEY` 的直接依赖，为 v6 架构提供更稳健、可扩展的数据访问层。

### 评论
这是架构升级中最重要的“基础设施”改进。通过封装，我们将存储的“实现细节”（使用哪个 Key、如何计算大小、如何处理 JSON）与“业务逻辑”（何时保存、如何合并）彻底解耦。这不仅解决了当前的硬编码问题，还为以后可能的存储后端切换奠定了基础。

### 目标
1.  在 `src/constants.js` 中定义所有版本相关的存储键。
2.  创建 `src/storage.js` 作为统一的存储访问入口。
3.  重构 `src/state.js`、`src/utils.js` 和 `src/ui/index.js`，移除所有直接对 `localStorage` 的调用。
4.  确保存储服务能够同时处理当前 (v6) 数据和旧版本 (v5) 的原始读取（用于迁移）。

### 基本原理
我们将采用“门面模式 (Facade Pattern)”。`src/storage.js` 将导出一个对象，该对象封装了所有 I/O 操作。业务模块不再关心数据存放在哪里，只需调用 `storage.load()` 或 `storage.save(data)`。此外，将大小计算逻辑从 `utils.js` 移动到 `storage.js` 是合逻辑的，因为“数据占用了多少存储空间”本身就是存储服务的元数据属性。

### 标签
#intent/architect #flow/ready #priority/high #comp/engine #concept/state #concept/config #scope/core #ai/brainstorm #task/domain/storage #task/object/storage-service #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 更新常量定义

我们需要确保所有的键名都在一个地方维护。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
// 全局配置与状态
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
export const CONFIG_KEY = 'chatLogArchive_config';
~~~~~
~~~~~javascript.new
// 全局配置与状态
export const STORAGE_KEY_V6 = 'chatLogArchive_v6';
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
export const CONFIG_KEY = 'chatLogArchive_config';
~~~~~

#### Acts 2: 创建存储封装模块 `src/storage.js`

这是核心的抽象层，它处理了所有的 JSON 序列化和 `localStorage` 交互。

~~~~~act
write_file
src/storage.js
~~~~~
~~~~~javascript
import { STORAGE_KEY_V6 } from './constants.js';

/**
 * 存储抽象层，统一管理本地持久化。
 */
export const storage = {
  /**
   * 加载 v6 数据。
   */
  load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_V6);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('[Storage] 加载 v6 数据失败:', e);
      return {};
    }
  },

  /**
   * 保存 v6 数据。
   */
  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[Storage] 保存 v6 数据失败:', e);
      return false;
    }
  },

  /**
   * 清空所有 v6 存档。
   */
  clear() {
    localStorage.removeItem(STORAGE_KEY_V6);
  },

  /**
   * 读取任意键的原始数据 (主要用于迁移)。
   */
  getRaw(key) {
    return localStorage.getItem(key);
  },

  /**
   * 移除任意键 (主要用于迁移后的清理)。
   */
  removeRaw(key) {
    localStorage.removeItem(key);
  },

  /**
   * 获取当前 v6 数据占用的 MB 数。
   */
  getUsageInMB() {
    const data = localStorage.getItem(STORAGE_KEY_V6);
    if (!data) return 0;
    const sizeInBytes = new Blob([data]).size;
    return sizeInBytes / (1024 * 1024);
  }
};
~~~~~

#### Acts 3: 重构 `src/state.js` 以使用存储服务

我们将 `loadMessagesFromStorage` 和 `saveMessagesToStorage` 变成对 `storage` 服务的简单包装，并更新迁移逻辑。

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
import { OLD_STORAGE_KEY_V4, STORAGE_KEY_V5, STORAGE_KEY_V6 } from './constants.js';
import { storage } from './storage.js';
import { getISOTimestamp } from './utils.js';

/**
 * 检查并执行一次性的数据迁移，将 v4 版本的数据转换为 v5 格式。
 */
export function migrateDataV4toV5() {
  const oldDataRaw = storage.getRaw(OLD_STORAGE_KEY_V4);
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

    // 迁移逻辑中暂时直接使用 localStorage 写入 V5 是允许的，
    // 因为这是针对 v4 的旧迁移。
    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(newData));
    storage.removeRaw(OLD_STORAGE_KEY_V4);
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
/** 从持久化层加载 v6 存档。*/
export function loadMessagesFromStorage() {
  return storage.load();
}

/** 将内存中的存档保存到持久化层。*/
export function saveMessagesToStorage(messagesObject) {
  if (storage.save(messagesObject)) {
    console.info('[State] 存档已保存到持久化存储');
  }
}
~~~~~

#### Acts 4: 重构 `src/utils.js` 移除冗余逻辑

`getStorageUsageInMB` 的职责已经转移到了 `storage.js`。

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
  return storage.getUsageInMB();
}
~~~~~

#### Acts 5: 修正 `src/ui/index.js` 中的清空逻辑

移除硬编码的键名删除操作。

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
        '【严重警告】此操作将清空所有本地存储的聊天存档。此操作不可恢复！确定要执行吗？',
      )
    ) {
      appCallbacks.deactivateLogger();
      storage.clear(); // 使用抽象层清空数据
      for (const key of Object.keys(appState)) {
        delete appState[key];
      }
      // 重置后不应立即扫描合并，而是保持空状态或由用户决定
      renderer.render(appState, uiCallbacks);
    }
  };
~~~~~

### 下一步建议
1.  **实现 `migrateDataV5toV6(targetServerName)`**: 既然我们已经有了 `storage.getRaw(key)` 和 `storage.removeRaw(key)`，现在可以非常安全地实现迁移函数。
2.  **主逻辑接入**: 在 `main.js` 中，开始利用 `extractServerFromDOM()` 获取服务器名，并初始化 v6 结构下的 `inMemoryChatState[serverName]`。
3.  **UI 状态隔离**: 按照路线图，接下来应该在 `ui/state.js` 中增加 `activeServer` 和 `viewingServer` 的管理逻辑，以支持多服务器切换查看。
