你的分析非常到位。在单页应用（SPA）如 Pony Town 中，DOM 的剧烈变化和脚本加载的先后顺序极易导致启动初期的“竞态条件”。

为了解决进入游戏过快导致服务器名捕获失败的问题，我将实施以下改进：
1. **持久化最后一次服务器**：在 `IndexedDB` 的配置存储中记录最后一次检测到的服务器。
2. **逻辑提前与回退策略**：在 `main.js` 启动的第一时间就开始监听服务器变化，并在激活记录器（`activateLogger`）时，如果 DOM 中已经没有服务器信息（已经进场），则自动回退到持久化的记录。

这是一个显著增强稳定性的改进，尤其是对于移动端用户。

## [WIP] feat: 增加服务器捕获的持久化与启动回退机制

### 用户需求
1. **时机优化**：将服务器名称捕获移至脚本启动最前端。
2. **持久化存储**：将最后检测到的服务器名存入 `localStorage` 或 `IDB`。
3. **回退逻辑**：若进场后未捕捉到服务器信息，自动回退到上次记录的服务器名。

### 评论
这个改动解决了脚本在快速登录场景下的“冷启动”问题。通过利用已有的 V7 (IndexedDB) `config` 存储空间，我们可以以极低的成本实现服务器上下文的持久化，从而确保记录器的激活逻辑更加健壮。

### 目标
1. 在 `constants.js` 定义存储键。
2. 在存储适配器中增加 `getLastServer` / `setLastServer` 接口。
3. 重构 `main.js` 的启动序列，确保服务器监听和状态恢复处于最高优先级。
4. 在 `activateLogger` 中实现双重检查回退。

### 基本原理
我们将 `last_server` 视为应用配置的一部分进行持久化。脚本启动后，在进行 UI 初始化前即尝试从数据库恢复 `detectedServerName`。同时，`serverObserver` 会被立即挂载。如果用户进场速度快于脚本执行，`activateLogger` 将能够直接使用恢复出来的持久化值，从而避免因 `detectedServerName` 为 null 而导致的记录功能不激活。

### 标签
#intent/build #flow/ready #priority/high #comp/engine #concept/state #scope/core #ai/brainstorm #task/domain/engine #task/object/server-detection #task/action/robustness-fix #task/state/begin

---

### Script

#### Acts 1: 更新常量与存储层接口

首先在 `constants.js` 中定义 key，并在适配器中实现存取逻辑。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
export const CONFIG_KEY = 'chatLogArchive_config';

// IndexedDB 配置
~~~~~
~~~~~javascript.new
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
export const CONFIG_KEY = 'chatLogArchive_config';
export const LAST_SERVER_KEY = 'chatLogArchive_lastServer';

// IndexedDB 配置
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  setSelfName(name) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_CONFIG], 'readwrite');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.put({ key: 'self_name', value: name.trim() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清除所有数据
~~~~~
~~~~~javascript.new
  setSelfName(name) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_CONFIG], 'readwrite');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.put({ key: 'self_name', value: name.trim() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  getLastServer() {
    return new Promise((resolve) => {
      const tx = this._tx([STORE_CONFIG], 'readonly');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.get('last_server');
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => resolve(null);
    });
  }

  setLastServer(name) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_CONFIG], 'readwrite');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.put({ key: 'last_server', value: name });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清除所有数据
~~~~~

~~~~~act
patch_file
src/storage/local-storage.adapter.js
~~~~~
~~~~~javascript.old
  setSelfName(name) {
    localStorage.setItem(SELF_NAME_KEY, name.trim());
    return Promise.resolve();
  }

  clearAllData() {
~~~~~
~~~~~javascript.new
  setSelfName(name) {
    localStorage.setItem(SELF_NAME_KEY, name.trim());
    return Promise.resolve();
  }

  getLastServer() {
    return Promise.resolve(localStorage.getItem('chatLogArchive_lastServer'));
  }

  setLastServer(name) {
    localStorage.setItem('chatLogArchive_lastServer', name);
    return Promise.resolve();
  }

  clearAllData() {
~~~~~

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  setSelfName(name) {
    return this.adapter.setSelfName(name);
  }

  clearAllData() {
~~~~~
~~~~~javascript.new
  setSelfName(name) {
    return this.adapter.setSelfName(name);
  }

  getLastServer() {
    return this.adapter.getLastServer();
  }

  setLastServer(name) {
    return this.adapter.setLastServer(name);
  }

  clearAllData() {
~~~~~

#### Acts 2: 重构 `main.js` 启动逻辑

修改 `main.js`，提前启动观察者，并在激活时增加回退逻辑。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
  /** 脚本主入口函数。*/
  async function main() {
    // 1. 初始化存储层 (并自动触发 V6->V7 迁移)
    // 开启 useIndexedDB = true
    await storageManager.init(true);

    // 构建 DataAdapter：UI 层与数据层的隔离界面
    const dataAdapter = {
      getServers: async () => await storageManager.getServers(),
      getChannels: async (server) => await storageManager.getChannels(server),
      getChannelCount: async (server, channel) =>
        await storageManager.getChannelCount(server, channel),
      getMessages: async (server, channel, page, pageSize) => {
        return await storageManager.getMessages(server, channel, page, pageSize);
      },
      getMessagesChunk: async (server, channel, lastTime, limit) => {
        return await storageManager.getMessagesChunk(server, channel, lastTime, limit);
      },
      getAllData: async () => await storageManager.loadAllV6(), // 用于导出功能
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state), // 仍提供给批量导入等特殊维护操作使用
      mergeMessagesToStorage: async (state) => await storageManager.mergeAllV6(state),
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
      replaceState: async (newState) => {
        // UI 会被通知刷新以自动请求新数据
      },
    });

    await uiControls.checkStorageUsage();

    // --- 启动服务器检测观察者 ---
    const updateServer = async () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
        }

        // 3. 检查并触发交互式迁移 (如 v5 -> v6)
        const currentState = await storageManager.loadAllV6();
        await MigrationManager.checkAndTriggerInteractiveMigrations(
          storageManager,
          server,
          currentState,
          (newState) => {
            if (uiControls.setState) uiControls.setState(newState);
          },
        );
      }
    };

    serverObserver = new MutationObserver(updateServer);
    serverObserver.observe(document.body, { childList: true, subtree: true });
    await updateServer(); // 立即执行一次

    const uiObserver = new MutationObserver(() => {
~~~~~
~~~~~javascript.new
  /** 脚本主入口函数。*/
  async function main() {
    // 1. 初始化存储层 (并自动触发 V6->V7 迁移)
    // 开启 useIndexedDB = true
    await storageManager.init(true);

    // --- 立即恢复上下文与启动服务器监听 (最高优先级) ---
    detectedServerName = await storageManager.getLastServer();

    const updateServer = async () => {
      const server = extractServerFromDOM();
      if (server && server !== detectedServerName) {
        detectedServerName = server;
        console.log(`[Archiver] Detected server switch: ${server}`);
        await storageManager.setLastServer(server); // 持久化缓存

        if (uiControls) {
          uiControls.updateRecordingStatus(detectedServerName, currentActiveChannel);
        }

        // 检查并触发交互式迁移 (如 v5 -> v6)
        const currentState = await storageManager.loadAllV6();
        await MigrationManager.checkAndTriggerInteractiveMigrations(
          storageManager,
          server,
          currentState,
          (newState) => {
            if (uiControls.setState) uiControls.setState(newState);
          },
        );
      }
    };

    serverObserver = new MutationObserver(updateServer);
    serverObserver.observe(document.body, { childList: true, subtree: true });
    await updateServer(); // 立即同步执行一次

    // 2. 初始化 UI 与数据适配器
    const dataAdapter = {
      getServers: async () => await storageManager.getServers(),
      getChannels: async (server) => await storageManager.getChannels(server),
      getChannelCount: async (server, channel) =>
        await storageManager.getChannelCount(server, channel),
      getMessages: async (server, channel, page, pageSize) => {
        return await storageManager.getMessages(server, channel, page, pageSize);
      },
      getMessagesChunk: async (server, channel, lastTime, limit) => {
        return await storageManager.getMessagesChunk(server, channel, lastTime, limit);
      },
      getAllData: async () => await storageManager.loadAllV6(), // 用于导出功能
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state), // 仍提供给批量导入等特殊维护操作使用
      mergeMessagesToStorage: async (state) => await storageManager.mergeAllV6(state),
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
      replaceState: async (newState) => {
        // UI 会被通知刷新以自动请求新数据
      },
    });

    await uiControls.checkStorageUsage();

    const uiObserver = new MutationObserver(() => {
~~~~~

### 下一步建议
我们已经显著增强了服务器检测的健壮性。下一步建议：
1. **多端同步预研**：既然已经有了持久化服务器名称，可以考虑将此信息同步到云端或导出文件中，以便在不同设备间维持一致的浏览体验。
2. **测试验证**：编写一个测试用例，模拟 `extractServerFromDOM` 返回 null 而存储中有值的场景，验证 `activateLogger` 的回退逻辑。
