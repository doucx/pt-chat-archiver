好的，现在我们将进入整个 PT Chat Archiver 性能重构路线图的**最后也是最关键的阶段：高级功能重构与还清技术债务**。

正如我们在债务梳理中提到的，目前系统虽然表面上是异步的，但为了支持“查重与清理”以及“存储大小计算”，底层依然保留了拉取全量内存的“后门” (`getRawState`)，这随时可能在数据量爆炸时导致内存崩溃。

由于 Web Worker 受限于 CSP 策略无法顺利应用，我们将在主线程中实施 **On-Demand Deduplication（按需分片查重）** 以及 **O(1) 极速空间估算法**。

我将生成一个计划来彻底解决这些遗留问题。

---

## [WIP] refactor: 重构高级功能并消除全量内存技术债务

### 用户需求
针对路线图中“第四阶段：高级功能重构”的要求：
1. 重构“查重与清理” (On-Demand Deduplication)：将原来的同步全量遍历改为异步分片查询，避免阻塞主线程和造成内存溢出。
2. 重构存储空间计算 (Incremental Size Calculation)：将原来的拉取全量数据进行 JSON 序列化改为高效的近似值估算。
3. 彻底清除 `getRawState` 这个拉取全量数据的遗留“后门”。

### 评论
通过这次重构，应用在日常运行以及配置页面维护时，都将彻底摆脱对“全量历史数据”的依赖。这将极大地增强应用在处理超大聊天记录（十几万条以上）时的响应性和稳定性。基于记录条数的空间估算法也避开了复杂的 Metadata 表维护及 DB 版本升级风险。

### 目标
1. 在 `storage` 适配器中实现 `getAllMessagesForChannel` 和 `deleteMessages`。
2. 将 `getRawSize` 改为基于 `count` 的 O(1) 极速估算。
3. 修改 `analysis.js`，编写基于单频道循环遍历并配合 `setTimeout` 释放主线程的异步扫描算法。
4. 修改 `ui/index.js` 和 `main.js`，移除 `getRawState` 依赖，对接新的异步 API。

### 基本原理
**查重异步化**：不再向 `analysis` 模块传递一整颗状态树，而是让它内部去逐个请求频道的记录。通过嵌套循环并在每个频道处理结束后加入 `await new Promise(r => setTimeout(r, 0))`，将计算分散到多个 Event Loop 宏任务中，避免长时间冻结 UI。
**空间极速估算**：在 IndexedDB 时代，精准获取对象存储的实际磁盘占用是极其困难且高开销的。利用已知的 `count` 乘以单条平均序列化大小（约 250 字节），可以瞬间返回一个有足够参考价值的估算值，带来最佳的用户体验。

### 标签
#intent/refine #flow/ready #priority/high
#comp/storage #comp/analysis #scope/core #scope/perf
#ai/delegate
#task/domain/storage #task/object/database-layer #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 升级 IndexedDB 适配器与存储层
新增按频道获取数据和批量删除数据的方法，并将低效的存储空间计算改为基于 `count` 的高效估算。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  /**
   * 清除所有数据
   */
  clearAllData() {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES, STORE_CONFIG], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      tx.objectStore(STORE_MESSAGES).clear();
      // 配置通常保留，或者根据需求清除。这里只清除消息是比较安全的做法。
      // 但为了符合 "Clear All Data" 的语义，我们通常也会重置状态。
      // 为保持行为一致，这里暂不清除配置，只清除消息。
    });
  }

  /**
   * 获取估算的存储大小 (字节)
   * 遍历所有存储的消息和配置，并累加序列化后的字节大小。
   */
  async getRawSize() {
    return new Promise((resolve) => {
      const tx = this._tx([STORE_MESSAGES, STORE_CONFIG], 'readonly');
      let totalSize = 0;

      const countSize = (storeName) => {
        return new Promise((res) => {
          const store = tx.objectStore(storeName);
          const request = store.getAll();
          request.onsuccess = () => {
            const data = request.result;
            const size = new Blob([JSON.stringify(data)]).size;
            res(size);
          };
          request.onerror = () => res(0);
        });
      };

      Promise.all([countSize(STORE_MESSAGES), countSize(STORE_CONFIG)]).then((sizes) => {
        totalSize = sizes.reduce((a, b) => a + b, 0);
        resolve(totalSize);
      });
    });
  }

  /**
   * 获取数据库中存储的消息总条数。
   */
~~~~~
~~~~~javascript.new
  /**
   * 获取特定频道的全量消息，用于独立的按需分析。
   */
  getAllMessagesForChannel(server, channel) {
    if (!server || !channel) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
      
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 批量删除消息
   */
  deleteMessages(ids) {
    if (!ids || ids.length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      
      for (const id of ids) {
        store.delete(id);
      }
    });
  }

  /**
   * 清除所有数据
   */
  clearAllData() {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES, STORE_CONFIG], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      tx.objectStore(STORE_MESSAGES).clear();
      // 配置通常保留，或者根据需求清除。这里只清除消息是比较安全的做法。
      // 但为了符合 "Clear All Data" 的语义，我们通常也会重置状态。
      // 为保持行为一致，这里暂不清除配置，只清除消息。
    });
  }

  /**
   * 获取估算的存储大小 (字节)
   * 采用 O(1) 经验估算法，避免全量序列化导致的内存崩溃和主线程卡顿。
   */
  async getRawSize() {
    const count = await this.getTotalMessageCount();
    // 经验值估算：一条 JSON 消息及其索引结构序列化后平均约 250 字节
    return count * 250;
  }

  /**
   * 获取数据库中存储的消息总条数。
   */
~~~~~

~~~~~act
patch_file
src/storage/local-storage.adapter.js
~~~~~
~~~~~javascript
  getRawSize() {
    const dataV6 = localStorage.getItem(STORAGE_KEY_V6) || '';
    const dataV5 = localStorage.getItem(STORAGE_KEY_V5) || '';
    const size = new Blob([dataV6]).size + new Blob([dataV5]).size;
    return Promise.resolve(size);
  }

  // --- Legacy Migration Support ---
~~~~~
~~~~~javascript
  getRawSize() {
    const dataV6 = localStorage.getItem(STORAGE_KEY_V6) || '';
    const dataV5 = localStorage.getItem(STORAGE_KEY_V5) || '';
    const size = new Blob([dataV6]).size + new Blob([dataV5]).size;
    return Promise.resolve(size);
  }

  getAllMessagesForChannel(server, channel) {
    return this.loadAllV6().then((state) => {
      if (state[server] && state[server][channel]) return state[server][channel];
      return [];
    });
  }

  deleteMessages(ids) {
    // LocalStorage 现在只是迁移源，不执行实际删除
    return Promise.resolve();
  }

  // --- Legacy Migration Support ---
~~~~~

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript
  getRawSize() {
    return this.adapter.getRawSize();
  }

  getTotalMessageCount() {
~~~~~
~~~~~javascript
  getRawSize() {
    return this.adapter.getRawSize();
  }

  getAllMessagesForChannel(server, channel) {
    if (this.adapter?.getAllMessagesForChannel) {
      return this.adapter.getAllMessagesForChannel(server, channel);
    }
    return Promise.resolve([]);
  }

  deleteMessages(ids) {
    if (this.adapter?.deleteMessages) {
      return this.adapter.deleteMessages(ids);
    }
    return Promise.resolve();
  }

  getTotalMessageCount() {
~~~~~

#### Acts 2: 改造 Analysis 模块为异步查重

~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript.old
  return is_in_burst;
}

/**
 * 清理一个频道记录中的重复数据。
 */
export function cleanChannelRecords(records) {
  if (!records || records.length === 0) return { cleanedRecords: [], removedCount: 0 };
  const is_in_burst = identifyBurstDuplicates(records);
  const cleanedRecords = [];
  const seen_contents = new Set();
  let removedCount = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // 彻底忽略 archiver 消息，它们不参与重复检测，也不应该阻断 content 的连续性判断
    if (record.is_archiver) {
      cleanedRecords.push(record);
      continue;
    }

    const content = record.content;
    const is_duplicate = content != null && seen_contents.has(content);
    // 只有非历史导入的、且处于爆发期的重复消息才会被删除
    const should_delete = !record.is_historical && is_duplicate && is_in_burst[i];

    if (!should_delete) {
      cleanedRecords.push(record);
    } else {
      removedCount++;
    }

    if (content != null) seen_contents.add(content);
  }
  return { cleanedRecords, removedCount };
}

/**
 * 检测所有频道中可被清理的重复记录总数。
 */
export function detectTotalDuplicates(messagesByChannel) {
  let totalDuplicates = 0;
  if (!messagesByChannel) return 0;
  for (const channel in messagesByChannel) {
    const records = messagesByChannel[channel];
    if (!records || records.length === 0) continue;
    const is_in_burst = identifyBurstDuplicates(records);
    const seen_contents = new Set();
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.is_archiver) continue; // 忽略标记

      const content = record.content;
      if (
        !record.is_historical &&
        content != null &&
        seen_contents.has(content) &&
        is_in_burst[i]
      ) {
        totalDuplicates++;
      }
      if (content != null) seen_contents.add(content);
    }
  }
  return totalDuplicates;
}
~~~~~
~~~~~javascript.new
  return is_in_burst;
}

/**
 * 异步检测所有频道中可被清理的重复记录总数。
 * 通过单频道迭代和释放主线程时间片，避免一次性加载全量数据卡死 UI。
 */
export async function detectTotalDuplicatesAsync(dataAdapter) {
  let totalDuplicates = 0;
  const servers = await dataAdapter.getServers();
  
  for (const server of servers) {
    const channels = await dataAdapter.getChannels(server);
    for (const channel of channels) {
      const records = await dataAdapter.getAllMessagesForChannel(server, channel);
      if (!records || records.length === 0) continue;
      
      const is_in_burst = identifyBurstDuplicates(records);
      const seen_contents = new Set();
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (record.is_archiver) continue;

        const content = record.content;
        if (
          !record.is_historical &&
          content != null &&
          seen_contents.has(content) &&
          is_in_burst[i]
        ) {
          totalDuplicates++;
        }
        if (content != null) seen_contents.add(content);
      }
      
      // 释放主线程时间片
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return totalDuplicates;
}

/**
 * 异步清理所有频道中的重复数据，直接执行实际的数据库批量删除操作。
 */
export async function cleanAllChannelRecordsAsync(dataAdapter) {
  let removedCount = 0;
  const servers = await dataAdapter.getServers();
  
  for (const server of servers) {
    const channels = await dataAdapter.getChannels(server);
    for (const channel of channels) {
      const records = await dataAdapter.getAllMessagesForChannel(server, channel);
      if (!records || records.length === 0) continue;
      
      const is_in_burst = identifyBurstDuplicates(records);
      const seen_contents = new Set();
      const idsToDelete = [];
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (record.is_archiver) continue;

        const content = record.content;
        const is_duplicate = content != null && seen_contents.has(content);
        const should_delete = !record.is_historical && is_duplicate && is_in_burst[i];

        if (should_delete) {
          idsToDelete.push(record.id);
        }
        
        if (content != null) seen_contents.add(content);
      }
      
      if (idsToDelete.length > 0) {
        await dataAdapter.deleteMessages(idsToDelete);
        removedCount += idsToDelete.length;
      }
      
      // 释放主线程时间片
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return removedCount;
}
~~~~~

#### Acts 3: 消除对 `getRawState` 的依赖并接入新 API

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  // 注意：cleanChannelRecords 等功能仍深度依赖同步计算，
  // 在 Phase 4 重构分析模块之前，我们暂时通过异步加载全量数据来维持逻辑
  const cleanChannelRecords = async () => {
    const rawState = await dataAdapter.getRawState();
    let totalToClean = 0;
    for (const server in rawState) {
      totalToClean += appCallbacks.detectTotalDuplicates(rawState[server]);
    }

    if (totalToClean === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${totalToClean} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const server in rawState) {
        const serverData = rawState[server];
        for (const channel in serverData) {
          const { cleanedRecords } = appCallbacks.cleanChannelRecords(serverData[channel]);
          serverData[channel] = cleanedRecords;
        }
      }
      await appCallbacks.saveMessagesToStorage(rawState);
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        refreshView();
      }, UI_FEEDBACK_DURATION);
    }
  };

  const clearAllData = async () => {
~~~~~
~~~~~javascript.new
  // 注意：cleanChannelRecords 等功能仍深度依赖同步计算，
  // 在 Phase 4 重构分析模块之前，我们暂时通过异步加载全量数据来维持逻辑
  const cleanChannelRecords = async () => {
    const totalToClean = await appCallbacks.getDuplicatesCount();

    if (totalToClean === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将从数据库中永久删除 ${totalToClean} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      const originalText = dom.cleanButton.textContent;
      dom.cleanButton.textContent = '清理中...';

      await appCallbacks.cleanAllChannelRecordsAsync();
      
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        dom.cleanButton.textContent = originalText;
        refreshView();
      }, UI_FEEDBACK_DURATION);
    }
  };

  const clearAllData = async () => {
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const clearLegacyData = async () => {
    MigrationManager.clearAllLegacyData();
    alert('旧版残留数据已清理。');
  };

  const uiCallbacks = {
    ...appCallbacks,
    getRawState: dataAdapter.getRawState, // 必须提供给分析模块
    cleanChannelRecords,
    clearAllData,
    importAllData,
    deleteV6Backup,
    recoverLegacyData,
~~~~~
~~~~~javascript.new
  const clearLegacyData = async () => {
    MigrationManager.clearAllLegacyData();
    alert('旧版残留数据已清理。');
  };

  const uiCallbacks = {
    ...appCallbacks,
    getDuplicatesCount: async () => await appCallbacks.detectTotalDuplicatesAsync(dataAdapter),
    cleanChannelRecords,
    clearAllData,
    importAllData,
    deleteV6Backup,
    recoverLegacyData,
~~~~~

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
      // 计算重复项总数 (需要从 callbacks 获取全量数据进行计算，或者由上层计算后传入)
      // 这里的逻辑暂时保留依赖 callbacks，直到查重功能也被重构
      if (callbacks.detectTotalDuplicates && callbacks.getRawState) {
        callbacks.getRawState().then((rawState) => {
          let totalDuplicates = 0;
          for (const server in rawState) {
            totalDuplicates += callbacks.detectTotalDuplicates(rawState[server]);
          }
          updateCleanButtonState(totalDuplicates);
        });
      }
      return;
~~~~~
~~~~~javascript.new
      // 计算重复项总数 (需要从 callbacks 获取全量数据进行计算，或者由上层计算后传入)
      // 这里的逻辑暂时保留依赖 callbacks，直到查重功能也被重构
      if (callbacks.getDuplicatesCount) {
        callbacks.getDuplicatesCount().then((totalDuplicates) => {
          updateCleanButtonState(totalDuplicates);
        });
      }
      return;
~~~~~

#### Acts 4: 修改主入口层并移除后门映射

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import './ui/style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
import { MigrationManager } from './migrations.js';
~~~~~
~~~~~javascript.new
import './ui/style.css';
import { cleanAllChannelRecordsAsync, detectTotalDuplicatesAsync } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
import { MigrationManager } from './migrations.js';
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    const dataAdapter = {
      getServers: async () => await storageManager.getServers(),
      getChannels: async (server) => await storageManager.getChannels(server),
      getMessages: async (server, channel, page, pageSize) => {
        return await storageManager.getMessages(server, channel, page, pageSize);
      },
      getAllData: async () => await storageManager.loadAllV6(), // 用于导出功能
      // 兼容旧接口，用于重型操作如分析模块等
      getRawState: async () => await storageManager.loadAllV6(),
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state), // 仍提供给批量导入等特殊维护操作使用
      cleanChannelRecords,
      detectTotalDuplicates,
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
      onAutoSaveIntervalChange: () => {}, // 设置间隔仅为了兼容旧UI交互
      replaceState: async (newState) => {
~~~~~
~~~~~javascript.new
    const dataAdapter = {
      getServers: async () => await storageManager.getServers(),
      getChannels: async (server) => await storageManager.getChannels(server),
      getMessages: async (server, channel, page, pageSize) => {
        return await storageManager.getMessages(server, channel, page, pageSize);
      },
      getAllData: async () => await storageManager.loadAllV6(), // 用于导出功能
      getAllMessagesForChannel: async (server, channel) => {
        return await storageManager.getAllMessagesForChannel(server, channel);
      },
      deleteMessages: async (ids) => {
        return await storageManager.deleteMessages(ids);
      },
    };

    uiControls = await createUI(dataAdapter, {
      scanAndMergeHistory,
      saveMessagesToStorage: async (state) => await storageManager.saveAllV6(state), // 仍提供给批量导入等特殊维护操作使用
      cleanAllChannelRecordsAsync: async () => await cleanAllChannelRecordsAsync(dataAdapter),
      detectTotalDuplicatesAsync,
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
      onAutoSaveIntervalChange: () => {}, // 设置间隔仅为了兼容旧UI交互
      replaceState: async (newState) => {
~~~~~

### 下一步建议
我们已经清除了整个重构计划中遗留的技术债务，并且实现了不阻断 UI 的异步算法。
建议在实际有数据的项目中开启设置界面，验证：
1. `估算数据占用` 是否能迅速显示且没有造成明显的性能下降。
2. `清理重复 (X)` 按钮的统计数值是否正确，且在点击运行后界面不再被冻结。
一旦上述验证通过，可以视为 V8 性能重构已全面完成。
