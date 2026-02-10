这是一个非常合理的重构建议。随着项目版本的快速迭代，将迁移逻辑（Migrations）从业务逻辑（Main/State）中剥离，不仅能让 `main.js` 更加纯粹，也能更清晰地管理不同版本间的演进关系。

我将创建一个专门的 `src/migrations.js` 来统一管理从 v4 到将来所有版本的迁移路径。

## [WIP] refactor: 建立独立的迁移管理系统并简化主程序逻辑

### 用户需求
需要一个专门的文件来处理版本更新逻辑（从 v4 到 v6 及未来版本），以支持平滑升级并简化 `main.js`。

### 评论
这是一个典型的解耦操作。目前迁移逻辑分散在 `main.js` 和 `state.js` 中，且 v5 到 v6 的迁移逻辑涉及用户确认（交互式），而 v4 到 v5 是静默的（非交互式）。建立一个统一的 `MigrationManager` 可以更好地封装这些差异，并为未来的 v7 提供标准的扩展接口。

### 目标
1.  新建 `src/migrations.js`，实现 `MigrationManager` 对象。
2.  将 `state.js` 中的迁移函数移动到 `migrations.js`。
3.  重构 `main.js`，通过 `MigrationManager` 驱动升级流。
4.  确保支持“链式升级”（例如 v4 用户在检测到服务器后，先执行 v4->v5 静默迁移，再触发 v5->v6 确认提示）。

### 基本原理
我们将迁移分为两类：
-   **静默迁移 (Silent)**：启动时自动执行，不干扰用户（如 v4 -> v5 的数据格式标准化）。
-   **交互式迁移 (Interactive)**：需要上下文（如服务器名）和用户确认（如 v5 -> v6）。

`MigrationManager` 将作为这些逻辑的唯一入口。

### 标签
#intent/refine #flow/ready #priority/high #comp/engine #concept/state #scope/core #ai/delegate #task/domain/storage #task/object/migration-system #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 创建 `src/migrations.js`

这个文件将作为版本升级的“指挥中心”。

~~~~~act
write_file
src/migrations.js
~~~~~
~~~~~javascript
import { storage } from './storage.js';
import { mergeAndDeduplicateMessages } from './state.js';

/**
 * 版本迁移管理器
 * 处理从旧版本到新版本的数据演进逻辑
 */
export const MigrationManager = {
  /**
   * 执行启动时的静默迁移
   */
  runSilentMigrations() {
    this.migrateV4toV5();
  },

  /**
   * v4 -> v5: 时间戳标准化
   * 将旧的本地字符串时间转换为标准的 ISO 8601 格式。
   */
  migrateV4toV5() {
    try {
      const oldData = storage.getLegacyV4Data();
      if (!oldData) return;

      console.log('[Migration] 检测到 v4 数据，执行静默迁移...');
      const newData = {};

      for (const channel in oldData) {
        newData[channel] = oldData[channel].map((msg) => {
          const newMsg = { ...msg };
          try {
            // v4 存储的是本地时间字符串，需要处理后转 ISO
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
      console.info('[Migration] v4 -> v5 迁移成功。');
    } catch (error) {
      console.error('[Migration] v4 迁移过程中出现错误:', error);
    }
  },

  /**
   * v5 -> v6: 多服务器支持
   * v5 数据是全局单服务器的，v6 需要将其映射到具体的服务器。
   */
  migrateV5toV6(v5Data, targetServer) {
    console.log(`[Migration] 正在执行 V5 到 V6 迁移，目标服务器: ${targetServer}`);
    const v6Data = storage.getV6Messages();

    if (!v6Data[targetServer]) {
      // 如果目标服务器没数据，直接搬迁
      v6Data[targetServer] = v5Data;
    } else {
      // 如果已经有数据，则执行频道级的智能合并
      for (const channel in v5Data) {
        v6Data[targetServer][channel] = mergeAndDeduplicateMessages(
          v6Data[targetServer][channel] || [],
          v5Data[channel],
        );
      }
    }

    storage.saveV6Messages(v6Data);
    storage.removeV5Data();
    console.info('[Migration] V5 -> V6 迁移完成，旧数据已移除。');
    return v6Data;
  },

  /**
   * 检查并触发交互式迁移
   * @param {string} serverName - 当前检测到的服务器名
   * @param {Function} onMigrated - 迁移成功后的回调函数，用于更新内存状态和UI
   */
  checkAndTriggerInteractiveMigrations(serverName, onMigrated) {
    if (!serverName) return;

    // 1. 处理 V5 -> V6
    const v5Data = storage.getMessages(); // 获取 V5 存档
    if (v5Data && Object.keys(v5Data).length > 0) {
      const confirmMsg = 
        `【数据升级】检测到您的旧版本聊天存档。\n\n` +
        `是否将其迁移到当前服务器 [${serverName}]？\n\n` +
        `注意：如果存档不属于此服务器，请点击“取消”，切换到正确的服务器后再执行此操作。`;
      
      if (confirm(confirmMsg)) {
        const newV6State = this.migrateV5toV6(v5Data, serverName);
        onMigrated(newV6State);
      }
    }
    
    // 2. 将来可以在这里添加 V6 -> V7 的检查逻辑
  },
};
~~~~~

#### Acts 2: 清理 `src/state.js` 中的迁移代码

将不再需要的迁移函数从 `state.js` 中移除。

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
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

/**
 * 智能合并消息数组，用于处理聊天记录不连续的情况。
~~~~~
~~~~~javascript.new
/**
 * 智能合并消息数组，用于处理聊天记录不连续的情况。
~~~~~
~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
/** 将内存中的存档保存到持久化层 (V6)。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到本地存储 (V6)');
  storage.saveV6Messages(messagesObject);
}

/**
 * 执行 V5 到 V6 的数据迁移。
 */
export function migrateV5toV6(v5Data, targetServer) {
  console.log(`[Migration] 正在将 V5 数据迁移到服务器: ${targetServer}`);
  const v6Data = storage.getV6Messages();

  if (!v6Data[targetServer]) {
    v6Data[targetServer] = v5Data;
  } else {
    // 如果目标服务器已存在数据，执行频道级合并
    for (const channel in v5Data) {
      v6Data[targetServer][channel] = mergeAndDeduplicateMessages(
        v6Data[targetServer][channel] || [],
        v5Data[channel],
      );
    }
  }

  storage.saveV6Messages(v6Data);
  storage.removeV5Data();
  console.log('[Migration] V5 迁移完成，旧数据已移除。');
  return v6Data;
}

/**
 * 根据条件将消息添加到合成频道。
~~~~~
~~~~~javascript.new
/** 将内存中的存档保存到持久化层 (V6)。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('存档已保存到本地存储 (V6)');
  storage.saveV6Messages(messagesObject);
}

/**
 * 根据条件将消息添加到合成频道。
~~~~~

#### Acts 3: 更新 `src/main.js` 以使用迁移管理器

清理 `main.js` 中的冗余逻辑，引入 `MigrationManager`。

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
  migrateV5toV6,
  saveMessagesToStorage,
} from './state.js';
import { storage } from './storage.js';
import { createUI } from './ui/index.js';
import {
  debounce,
  formatISOTimeForDisplay,
  getISOTimestamp,
  getStorageUsageInMB,
} from './utils.js';
~~~~~
~~~~~javascript.new
import './style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
import { MigrationManager } from './migrations.js';
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
  saveMessagesToStorage,
} from './state.js';
import { storage } from './storage.js';
import { createUI } from './ui/index.js';
import { debounce, getISOTimestamp } from './utils.js';
~~~~~
~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /** 脚本主入口函数。*/
  function main() {
    migrateDataV4toV5();
    inMemoryChatState = loadMessagesFromStorage();
    uiControls = createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage,
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
    });

    uiControls.checkStorageUsage();

    // --- 启动服务器检测观察者 ---
    const updateServer = () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] 检测到服务器切换: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }

        // 检查 V5 数据迁移逻辑
        const v5Data = storage.getMessages(); // storage.getMessages 获取的是 V5
        if (v5Data && Object.keys(v5Data).length > 0) {
          const msg = `【数据升级】检测到您的旧版本聊天存档。是否将其迁移到当前服务器 [${server}]？\n\n注意：如果不是该服务器，则选择取消，再选择目标服务器后迁移提示将再次弹出。`;
          if (confirm(msg)) {
            inMemoryChatState = migrateV5toV6(v5Data, server);
            uiControls.setState(inMemoryChatState);
          }
        }
      }
    };
~~~~~
~~~~~javascript.new
  /** 脚本主入口函数。*/
  function main() {
    // 1. 执行静默迁移 (如 v4 -> v5)
    MigrationManager.runSilentMigrations();

    // 2. 加载状态与初始化 UI
    inMemoryChatState = loadMessagesFromStorage();
    uiControls = createUI(inMemoryChatState, {
      scanAndMergeHistory,
      saveMessagesToStorage,
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
    });

    uiControls.checkStorageUsage();

    // --- 启动服务器检测观察者 ---
    const updateServer = () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] 检测到服务器切换: ${server}`);
        if (uiControls) {
          uiControls.updateServerDisplay(detectedServerName);
        }

        // 3. 检查并触发交互式迁移 (如 v5 -> v6)
        MigrationManager.checkAndTriggerInteractiveMigrations(server, (newState) => {
          inMemoryChatState = newState;
          uiControls.setState(inMemoryChatState);
        });
      }
    };
~~~~~

### 下一步建议
1.  **版本预埋**：在 `constants.js` 中定义一个 `CURRENT_VERSION = 6`，并在存储中记录当前数据的版本号，这样未来的 `MigrationManager` 就可以直接通过版本号对比来决定需要运行哪些迁移，而不是像现在这样依赖于 `storage_key` 的存在性检查。
2.  **单元测试**：随着迁移逻辑变得复杂，建议为 `MigrationManager` 编写专门的单元测试，模拟 v4/v5 数据环境，验证其升级路径的准确性。
3.  **UI 提示优化**：目前的迁移确认使用了浏览器原生的 `confirm`。如果为了更好的用户体验，可以考虑在 `ui/templates.js` 中增加一个专门的“升级通知中心”组件。
