好的，我们来实施 V6 架构升级路线图的第一部分核心后端改造。

这部分工作是整个升级中最关键的基础设施建设。我们将引入新的 V6 数据结构，确保数据能够按服务器隔离存储，并建立一个安全的数据迁移通道，让现有用户可以平滑过渡。这为后续所有 UI 和交互层面的革新铺平了道路。

## [WIP] refactor: 实现 V6 服务器感知状态管理与迁移

### 用户需求
根据 V6 升级路线图，需要实施“阶段一”的常量定义和“阶段二”的全部核心重构。这包括：
1.  在 `src/constants.js` 中定义新的 `STORAGE_KEY_V6`。
2.  重构 `src/state.js`，使其原生支持以服务器为键的 V6 数据结构 (`Server -> Channel -> Messages`)。
3.  在 `src/state.js` 中创建一个新的 `migrateDataV5toV6` 函数，用于将旧的 v5 数据安全地迁移到指定服务器的命名空间下。
4.  更新 `src/utils.js` 中的工具函数，使其与新的 V6 存储键保持一致。

### 评论
这是本次架构升级的基石。从扁平化的 v5 结构演进到层级化的 v6 结构，是解决多服务器数据混淆问题的根本性方案。设计一个明确、一次性的迁移函数 (`migrateDataV5toV6`) 是保障用户数据安全和提供平滑过渡体验的关键，而修改 `state.js` 中所有的数据存取函数则是确保新架构能够正确运行的核心。此步骤完成后，应用的数据层将为服务器感知做好充分准备。

### 目标
1.  **定义新常量**: 在 `src/constants.js` 中添加 `STORAGE_KEY_V6`。
2.  **重构状态管理**: 修改 `src/state.js` 中的 `loadMessagesFromStorage` 和 `saveMessagesToStorage` 函数，使其读写 V6 格式的数据。
3.  **实现数据迁移**: 在 `src/state.js` 中新增 `migrateDataV5toV6(targetServerName)` 函数，实现从 v5 到 v6 的数据迁移、合并、旧数据清理等逻辑。
4.  **适配工具函数**: 修改 `addMessageToSyntheticChannelIfNeeded` 函数签名以适应新数据结构，并更新 `src/utils.js` 中的 `getStorageUsageInMB` 以引用正确的存储键。

### 基本原理
我们将通过引入一个新的存储键 `STORAGE_KEY_V6` 来标识新数据结构，同时保留 `STORAGE_KEY_V5` 作为触发迁移的信号。所有核心的数据持久化逻辑都集中在 `state.js` 中，因此我们将重写该文件内的函数来处理新的 `{[serverName]: {[channelName]: messages[]}}` 结构。迁移函数将作为核心枢纽，负责读取旧数据、与可能已存在的 v6 数据进行安全合并，最后清除旧的 v5 键以防止重复迁移。对 `utils.js` 的修改则确保了外围功能（如存储空间计算）的正确性。

### 标签
#intent/refactor #intent/build #flow/ready #priority/high #comp/engine #concept/state #scope/core #ai/instruct #task/domain/storage #task/object/v6-migration #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 定义新的存储常量

首先，在 `src/constants.js` 文件中添加新的 `STORAGE_KEY_V6`。我们保留 v5 的键，因为它将用于检测是否需要进行数据迁移。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
// 全局配置与状态
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
~~~~~
~~~~~javascript.new
// 全局配置与状态
export const STORAGE_KEY_V6 = 'chatLogArchive_v6';
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
~~~~~

#### Acts 2: 更新工具函数以适配新存储键

接下来，我们修改 `src/utils.js` 中的存储占用计算函数，让它指向新的 V6 存储键。

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
~~~~~
~~~~~javascript.new
import { STORAGE_KEY_V6 } from './constants.js';

/**
 * 计算脚本在 localStorage 中的存储占用空间。
 * @returns {number} - 占用的空间大小，单位是 MB。
 */
export function getStorageUsageInMB() {
  const data = localStorage.getItem(STORAGE_KEY_V6);
  if (!data) return 0;
  // 使用 Blob 来精确计算字符串的字节大小
~~~~~

#### Acts 3: 重构状态管理模块以支持 V6 结构

这是本次任务的核心。我们将完全重写 `src/state.js`，引入 V6 数据结构的支持，并实现关键的 V5 到 V6 迁移逻辑。

~~~~~act
write_file
src/state.js
~~~~~
~~~~~javascript
import { OLD_STORAGE_KEY_V4, STORAGE_KEY_V5, STORAGE_KEY_V6 } from './constants.js';
import { getISOTimestamp } from './utils.js';

/**
 * 检查并执行一次性的数据迁移，将 v4 版本的数据转换为 v5 格式。
 * @deprecated 将在 v6 稳定后移除
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

    // 注意：这里迁移到 v5 key，以便后续的 v5->v6 迁移可以接管
    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(newData));
    localStorage.removeItem(OLD_STORAGE_KEY_V4);
    console.log('v4 -> v5 数据迁移成功！');
  } catch (error) {
    console.error('v4 -> v5 数据迁移失败，旧数据可能已损坏，将予以保留。', error);
  }
}

/**
 * 核心迁移函数：将 v5 数据迁移到 v6 结构中指定服务器的命名空间下。
 * @param {string} targetServerName - 用户选择要将旧数据归档到的服务器名称。
 * @returns {object|null} - 成功则返回更新后的 v6 数据对象，否则返回 null。
 */
export function migrateDataV5toV6(targetServerName) {
  const v5DataRaw = localStorage.getItem(STORAGE_KEY_V5);
  if (!v5DataRaw) return null;

  console.log(`检测到 v5 数据，开始迁移到服务器 [${targetServerName}]...`);
  try {
    const v5Data = JSON.parse(v5DataRaw);
    const v6Data = loadMessagesFromStorage(); // 加载现有的 v6 数据

    const existingServerData = v6Data[targetServerName] || {};

    // 合并策略：遍历 v5 的每个频道，并将其与 v6 中对应服务器的频道合并
    for (const channelName in v5Data) {
      const v5ChannelMessages = v5Data[channelName];
      const v6ChannelMessages = existingServerData[channelName] || [];
      existingServerData[channelName] = mergeAndDeduplicateMessages(
        v6ChannelMessages,
        v5ChannelMessages,
      );
    }
    v6Data[targetServerName] = existingServerData;

    saveMessagesToStorage(v6Data);
    localStorage.removeItem(STORAGE_KEY_V5); // 关键步骤：防止重复迁移
    console.log('v5 -> v6 数据迁移成功！');
    return v6Data; // 返回最新的完整数据
  } catch (error) {
    console.error('v5 -> v6 数据迁移失败!', error);
    return null;
  }
}

/**
 * 智能合并消息数组，用于处理聊天记录不连续的情况。
 */
export function mergeAndDeduplicateMessages(oldMessages, newMessages) {
  if (!oldMessages || oldMessages.length === 0) return newMessages;
  if (!newMessages || newMessages.length === 0) return oldMessages;
  const oldUserMessages = oldMessages.filter((msg) => !msg.is_archiver);
  const newUserMessages = newMessages.filter((msg) => !msg.is_archiver);
  let overlapLength = 0;
  const maxPossibleOverlap = Math.min(oldUserMessages.length, newUserMessages.length);
  for (let i = maxPossibleOverlap; i > 0; i--) {
    const suffixOfOld = oldUserMessages.slice(-i).map((msg) => msg.content);
    const prefixOfNew = newUserMessages.slice(0, i).map((msg) => msg.content);
    if (JSON.stringify(suffixOfOld) === JSON.stringify(prefixOfNew)) {
      overlapLength = i;
      break;
    }
  }
  let messagesToAdd;
  if (overlapLength > 0) {
    const lastOverlappingUserMessage = newUserMessages[overlapLength - 1];
    const lastOverlappingIndexInNew = newMessages.findIndex(
      (msg) => msg === lastOverlappingUserMessage,
    );
    messagesToAdd = newMessages.slice(lastOverlappingIndexInNew + 1);
  } else {
    messagesToAdd = newMessages;
  }
  const discontinuityDetected =
    oldMessages.length > 0 && newMessages.length > 0 && overlapLength === 0;
  if (messagesToAdd.length === 0) return oldMessages;
  if (discontinuityDetected) {
    console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
    const discontinuityMark = {
      time: getISOTimestamp(),
      type: 'system',
      sender: 'Archiver',
      receiver: 'System',
      content: '[警告 - 此处可能存在记录丢失]',
      is_archiver: true,
    };
    return oldMessages.concat([discontinuityMark], messagesToAdd);
  }
  return oldMessages.concat(messagesToAdd);
}

/** 从 localStorage 加载 V6 存档。*/
export function loadMessagesFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_V6)) || {};
  } catch (e) {
    console.error('读取 V6 存档失败，数据已损坏。', e);
    return {};
  }
}

/** 将内存中的 V6 存档保存到 localStorage。*/
export function saveMessagesToStorage(messagesObject) {
  console.info('V6 存档已保存到 localStorage');
  localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(messagesObject));
}

/**
 * 根据条件将消息添加到合成频道。
 * @param {object} channelMap - 当前服务器的频道-消息映射 (e.g., inMemoryChatState[serverName])。
 * @param {object} message - 消息数据对象。
 * @param {string} activeChannel - 消息产生时所在的活跃频道。
 */
export function addMessageToSyntheticChannelIfNeeded(channelMap, message, activeChannel) {
  if (activeChannel !== 'Local') {
    return;
  }
  let syntheticChannelName = null;
  if (message.type.includes('party')) {
    syntheticChannelName = 'Party-Local';
  } else if (message.type.includes('whisper')) {
    syntheticChannelName = 'Whisper-Local';
  }
  if (syntheticChannelName) {
    if (!channelMap[syntheticChannelName]) {
      channelMap[syntheticChannelName] = [];
    }
    channelMap[syntheticChannelName].push({ ...message });
    console.log(`消息已自动复制到合成频道 [${syntheticChannelName}]`);
  }
}
~~~~~

### 下一步建议

我们已经成功地重构了应用的数据核心，为 V6 架构奠定了坚实的基础。

下一步，我们应该遵循路线图进入 **阶段三：革新交互 - UI 模块全面升级**。具体任务将是：
1.  **重构 `src/ui.js`**：引入其独立的内部状态，并向外暴露一个 `setState(newState)` 接口。这是解耦主逻辑与 UI、确保状态同步的关键。
2.  **实现多服务器视图**：修改 `updateUI` 和 `renderCurrentView` 函数，使其能够渲染新的、包含多服务器数据的 V6 状态树，并处理“实时记录服务器”与“只读查看服务器”之间的切换逻辑。

如果你同意，我将开始准备执行此阶段的计划。
