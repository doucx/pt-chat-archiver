好的，我们将开始执行 **PonyTown 聊天存档器 v6 架构升级** 的第一阶段。

这个阶段的任务是为多服务器支持奠定基础，主要涉及常量定义、存储驱动的扩展以及 UI 模板的初步调整。这将允许我们在不破坏现有 V5 逻辑的前提下，开始引入 V6 的分层数据结构。

## [WIP] feat: 实施 v6 升级阶段一 - 基础设施与 UI 增强

### 用户需求
需要升级项目的底层基础设施，以支持 v6 版本的分层存储架构（`Server -> Channel -> Messages`）。这包括定义新的存储键、扩展存储驱动以支持 V6 数据操作，并更新 UI 模板以包含服务器选择器。

### 评论
这是架构升级中最稳健的第一步。通过保留 V5 逻辑并并行引入 V6 逻辑，我们创造了一个安全的过渡环境，为后续的数据迁移算法提供了“目的地”。

### 目标
1.  在 `constants.js` 中定义 `STORAGE_KEY_V6`。
2.  在 `storage.js` 中增加针对 V6 存储的操作方法，并增强存储容量计算的准确性。
3.  在 `templates.js` 的设置视图中添加服务器查看选择器。
4.  更新 `ui/dom.js` 以便代码能够引用新的 UI 元素。

### 基本原理
遵循“分而治之”和“向前兼容”的原则。我们通过引入新的存储键 `chatLogArchive_v6` 来隔离新旧数据。在 UI 上，通过在设置面板添加服务器选择器，为用户提供了管理多服务器数据的入口。

### 标签
#intent/build #flow/ready #priority/high #comp/storage #comp/docs #concept/state #scope/core #ai/instruct #task/domain/architecture #task/object/v6-upgrade #task/action/infrastructure #task/state/begin

---

### Script

#### Acts 1: 定义 v6 存储常量

我们将新的存储键添加到常量定义文件中。

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

#### Acts 2: 扩展存储驱动以支持 v6

我们在 `storage.js` 中添加 V6 专用方法，并更新原始字节大小计算函数，使其在 V6 存在时优先计算 V6。

~~~~~act
patch_file
src/storage.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
import {
  CONFIG_KEY,
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_KEY_V6,
} from './constants.js';

/**
 * 核心存储驱动，封装对 localStorage 的直接访问。
 */
export const storage = {
  // --- 聊天记录 (Messages) ---
  /** 加载 V6 数据 (Server -> Channel -> Messages) */
  getV6Messages() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_V6);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('[Storage] 解析 V6 存档失败:', e);
      return {};
    }
  },

  /** 保存 V6 数据 */
  saveV6Messages(messagesObject) {
    try {
      localStorage.setItem(STORAGE_KEY_V6, JSON.stringify(messagesObject));
    } catch (e) {
      console.error('[Storage] 保存 V6 存档失败:', e);
    }
  },

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
    localStorage.removeItem(STORAGE_KEY_V6);
    localStorage.removeItem(STORAGE_KEY_V5);
  },

  /** 返回存档的原始字节大小（用于容量计算） */
  getMessagesRawSize() {
    const dataV6 = localStorage.getItem(STORAGE_KEY_V6);
    if (dataV6) return new Blob([dataV6]).size;
    const dataV5 = localStorage.getItem(STORAGE_KEY_V5);
    return dataV5 ? new Blob([dataV5]).size : 0;
  },
~~~~~

#### Acts 3: 更新 UI 模板

我们在设置视图中添加服务器选择器，以便用户未来可以切换查看不同服务器的存档。

~~~~~act
patch_file
src/templates.js
~~~~~
~~~~~javascript.old
        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
~~~~~
~~~~~javascript.new
        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <div class="config-group">
                <label>查看存档服务器</label>
                <select id="log-archive-server-view-selector" class="log-archive-ui-button"></select>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    切换查看不同服务器的历史记录。注意：此切换仅影响显示，不影响当前的数据录制。
                </div>
            </div>
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
~~~~~

#### Acts 4: 更新 DOM 引用

我们将新添加的服务器选择器包含在 `getDOMElements` 返回的对象中。

~~~~~act
patch_file
src/ui/dom.js
~~~~~
~~~~~javascript.old
    // Config View Controls
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
~~~~~
~~~~~javascript.new
    // Config View Controls
    serverViewSelector: document.getElementById('log-archive-server-view-selector'),
    selfNameInput: document.getElementById('log-archive-self-name-input'),
    pageSizeInput: document.getElementById('log-archive-page-size-input'),
    configStorageInfo: document.getElementById('log-archive-config-storage-info'),
~~~~~

### 下一步建议

基础设施已经就绪。接下来的关键步骤是 **阶段二：UI 状态与渲染重构**。

我们需要：
1.  修改 `src/ui/state.js`，使 UI 能够识别“当前物理服务器”和“正在查看的服务器”。
2.  修改 `src/ui/renderer.js` 中的 `render` 函数，使其根据 `viewingServer` 从分层状态中切片数据。
3.  在 `src/ui/events.js` 中绑定服务器选择器的切换事件。

当你准备好进行 UI 状态的逻辑升级时，请告知我。
