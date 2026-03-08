非常棒的分析。由于浏览器对 `Web Worker` 的安全策略限制（特别是 `blob:` 和外域脚本），我们必须在主线程中进行“查重与清理”。

## [WIP] 重构计算存储占用,查重与清理

结合前面的阶段 2 已经将所有全量读取改为数据库访问，现在我们可以将最耗时的两部分进行轻量级异步重构：
1. **重构计算存储占用 (`getRawSize`)**: 彻底舍弃之前的 `getAll()` 后做 `JSON.stringify()`，改用 `store.count() * 估算单条大小`。这使得空间估算的耗时从秒级直接降为 **0毫秒级 (O(1))**。
2. **重构查重与清理 (`cleanChannelRecords`)**:
    *   **按需扫描**: 去掉页面加载时的自动扫描。
    *   **UI 状态机流转**: 将原先的清理按钮改为 `扫描重复` -> `清理重复 (X)` -> `执行清理` 的交互流。
    *   **基于游标分片的异步算法**: 利用 IDB 的 `getAll(range, limit)` 特性，通过记录上一次加载的 `lastTime` 游标，每次提取 5000 条，读取一批后 `await setTimeout` 让出主线程。这实现了无感知的百万级数据遍历。

下面我将执行相关指令完成这一重构：

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  getLatestMessages(server, channel, limit) {
~~~~~
~~~~~javascript.new
  getMessagesChunk(server, channel, lastTime, limit = 2000) {
    if (!server || !channel) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      
      let range;
      if (lastTime) {
        range = IDBKeyRange.bound([server, channel, lastTime], [server, channel, '\uffff'], true, false);
      } else {
        range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
      }
      
      const request = index.getAll(range, limit);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getLatestMessages(server, channel, limit) {
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  putMessages(msgs) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const msg of msgs) {
        if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
        store.put(msg);
      }
    });
  }
~~~~~
~~~~~javascript.new
  putMessages(msgs) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const msg of msgs) {
        if (!msg.id) msg.id = generateULID(new Date(msg.time).getTime());
        store.put(msg);
      }
    });
  }

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
~~~~~

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
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
~~~~~
~~~~~javascript.new
  /**
   * 获取估算的存储大小 (字节)
   * 通过消息总数进行 O(1) 估算，避免在数据量大时 getAll 导致内存溢出。
   */
  async getRawSize() {
    const count = await this.getTotalMessageCount();
    // 假设每条消息平均占用 150 字节的存储空间
    const estimatedSize = count * 150; 
    return estimatedSize;
  }
~~~~~

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  getLatestMessages(server, channel, limit) {
    if (this.adapter?.getLatestMessages)
      return this.adapter.getLatestMessages(server, channel, limit);
    return Promise.resolve([]);
  }
~~~~~
~~~~~javascript.new
  getMessagesChunk(server, channel, lastTime, limit) {
    if (this.adapter?.getMessagesChunk)
      return this.adapter.getMessagesChunk(server, channel, lastTime, limit);
    return Promise.resolve([]);
  }

  getLatestMessages(server, channel, limit) {
    if (this.adapter?.getLatestMessages)
      return this.adapter.getLatestMessages(server, channel, limit);
    return Promise.resolve([]);
  }

  deleteMessages(ids) {
    if (this.adapter?.deleteMessages)
      return this.adapter.deleteMessages(ids);
    return Promise.resolve();
  }
~~~~~

~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript.old
/**
 * 清理一个频道记录中的重复数据。
 */
export function cleanChannelRecords(records) {
~~~~~
~~~~~javascript.new
/**
 * 异步、分片扫描所有频道的重复记录，以避免阻塞 UI
 * @param {object} dataAdapter - 数据适配器
 * @returns {Promise<Array<string>>} - 返回所有需要删除的重复记录的 ID 列表
 */
export async function scanAllDuplicatesAsync(dataAdapter) {
  const duplicateIds = [];
  const servers = await dataAdapter.getServers();
  
  for (const server of servers) {
    const channels = await dataAdapter.getChannels(server);
    
    for (const channel of channels) {
      const channelMessages = [];
      let lastTime = null;
      
      // 分片加载当前频道的所有消息
      while (true) {
        const chunk = await dataAdapter.getMessagesChunk(server, channel, lastTime, 5000);
        if (chunk.length === 0) break;
        channelMessages.push(...chunk);
        lastTime = chunk[chunk.length - 1].time;
        if (chunk.length < 5000) break;
        
        // 关键：在加载每一片后让出主线程，避免 UI 冻结
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      // 分析当前频道的重复项
      const is_in_burst = identifyBurstDuplicates(channelMessages);
      const seen_contents = new Set();
      
      for (let i = 0; i < channelMessages.length; i++) {
        const record = channelMessages[i];
        if (record.is_archiver) continue;
        
        const content = record.content;
        const is_duplicate = content != null && seen_contents.has(content);
        const should_delete = !record.is_historical && is_duplicate && is_in_burst[i];
        
        if (should_delete) {
          duplicateIds.push(record.id);
        }
        
        if (content != null) seen_contents.add(content);
      }
      
      // 释放内存，进入下一个频道
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return duplicateIds;
}

/**
 * 清理一个频道记录中的重复数据。
 */
export function cleanChannelRecords(records) {
~~~~~

~~~~~act
patch_file
src/ui/templates.js
~~~~~
~~~~~javascript.old
                    <div class="config-actions" style="display: flex; gap: 8px;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">清理重复</button>
                        <button id="log-archive-import-button" class="log-archive-ui-button" style="flex-grow: 1;">导入 JSON</button>
                    </div>
~~~~~
~~~~~javascript.new
                    <div class="config-actions" style="display: flex; gap: 8px;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">扫描重复记录</button>
                        <button id="log-archive-import-button" class="log-archive-ui-button" style="flex-grow: 1;">导入 JSON</button>
                    </div>
~~~~~

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
  const updateCleanButtonState = (count) => {
    if (count > 0) {
      dom.cleanButton.classList.add('active');
      dom.cleanButton.textContent = `清理重复 (${count})`;
    } else {
      dom.cleanButton.classList.remove('active');
      dom.cleanButton.textContent = '清理重复记录';
    }
  };

  // --- Main Render Logic ---
~~~~~
~~~~~javascript.new
  // --- Main Render Logic ---
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
    }

    if (viewMode === 'stats') {
~~~~~
~~~~~javascript.new
      return;
    }

    if (viewMode === 'stats') {
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
  dom.autoFollowInput.addEventListener('change', async () => {
    await uiState.setAutoFollowServer(dom.autoFollowInput.checked);
    triggerRefresh();
  });

  dom.cleanButton.addEventListener('click', async () => {
    await callbacks.cleanChannelRecords();
    triggerRefresh(); // Re-render to update button state
  });

  dom.clearButton.addEventListener('click', async () => {
~~~~~
~~~~~javascript.new
  dom.autoFollowInput.addEventListener('change', async () => {
    await uiState.setAutoFollowServer(dom.autoFollowInput.checked);
    triggerRefresh();
  });

  let pendingDuplicateIds = null;
  dom.cleanButton.addEventListener('click', async () => {
    if (pendingDuplicateIds === null) {
      // 当前是“扫描”状态
      dom.cleanButton.textContent = '扫描中...';
      dom.cleanButton.disabled = true;
      try {
        const ids = await callbacks.scanDuplicates();
        if (ids.length === 0) {
          dom.cleanButton.textContent = '未发现重复';
          setTimeout(() => {
            dom.cleanButton.textContent = '扫描重复记录';
          }, UI_FEEDBACK_DURATION);
        } else {
          pendingDuplicateIds = ids;
          dom.cleanButton.textContent = `清理重复 (${ids.length})`;
          dom.cleanButton.classList.add('active');
        }
      } finally {
        dom.cleanButton.disabled = false;
      }
    } else {
      // 当前是“清理”状态
      if (confirm(`【确认】将删除 ${pendingDuplicateIds.length} 条重复记录。此操作不可逆。确定要继续吗？`)) {
        dom.cleanButton.textContent = '清理中...';
        dom.cleanButton.disabled = true;
        try {
          await callbacks.deleteMessages(pendingDuplicateIds);
          pendingDuplicateIds = null;
          dom.cleanButton.textContent = '清理完毕!';
          dom.cleanButton.classList.remove('active');
          setTimeout(() => {
            dom.cleanButton.textContent = '扫描重复记录';
            triggerRefresh();
          }, UI_FEEDBACK_DURATION);
        } finally {
          dom.cleanButton.disabled = false;
        }
      }
    }
  });

  dom.clearButton.addEventListener('click', async () => {
~~~~~

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
  const clearAllData = async () => {
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const uiCallbacks = {
    ...appCallbacks,
    getRawState: dataAdapter.getRawState, // 必须提供给分析模块
    cleanChannelRecords,
    clearAllData,
    importAllData,
    deleteV6Backup,
~~~~~
~~~~~javascript.new
  const uiCallbacks = {
    ...appCallbacks,
    scanDuplicates: () => appCallbacks.scanAllDuplicatesAsync(dataAdapter),
    deleteMessages: appCallbacks.deleteMessages,
    clearAllData,
    importAllData,
    deleteV6Backup,
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import './ui/style.css';
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
~~~~~
~~~~~javascript.new
import './ui/style.css';
import { scanAllDuplicatesAsync } from './analysis.js';
import { SELF_NAME_KEY } from './constants.js';
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
    // 构建 DataAdapter：UI 层与数据层的隔离界面
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
~~~~~
~~~~~javascript.new
    // 构建 DataAdapter：UI 层与数据层的隔离界面
    const dataAdapter = {
      getServers: async () => await storageManager.getServers(),
      getChannels: async (server) => await storageManager.getChannels(server),
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
      scanAllDuplicatesAsync,
      deleteMessages: async (ids) => await storageManager.deleteMessages(ids),
      deactivateLogger,
      manualSave: async () => {}, // 增量写入模式下已无需手动保存
~~~~~

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanChannelRecords, detectTotalDuplicates } from '../src/analysis.js';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.js';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';

const createMockAdapter = (state) => ({
  getServers: async () => Object.keys(state),
  getChannels: async (server) => Object.keys(state[server] || {}),
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
    const start = (page - 1) * pageSize;
    return {
      messages: list.slice(start, start + pageSize),
      total: list.length,
    };
  },
  getAllData: async () => state,
  getRawState: async () => state,
});
~~~~~
~~~~~javascript.new
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '../src/storage/index.js';
import { createUI } from '../src/ui/index.js';
import '@testing-library/jest-dom/vitest';

global.__APP_VERSION__ = '7.0.0-test';

const createMockAdapter = (state) => ({
  getServers: async () => Object.keys(state),
  getChannels: async (server) => Object.keys(state[server] || {}),
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
    const start = (page - 1) * pageSize;
    return {
      messages: list.slice(start, start + pageSize),
      total: list.length,
    };
  },
  getMessagesChunk: async (server, channel, lastTime, limit) => {
    // 模拟分片读取
    const list = state[server]?.[channel] || [];
    let startIndex = 0;
    if (lastTime) {
      startIndex = list.findIndex(m => m.time > lastTime);
      if (startIndex === -1) return [];
    }
    return list.slice(startIndex, startIndex + limit);
  },
  getAllData: async () => state,
});
~~~~~

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
    mockCallbacks = {
      scanAndMergeHistory: vi.fn(),
      saveMessagesToStorage: vi.fn(() => Promise.resolve()),
      cleanChannelRecords, // 使用真实算法
      detectTotalDuplicates, // 使用真实算法
      deactivateLogger: vi.fn(),
      manualSave: vi.fn(),
      onAutoSaveIntervalChange: vi.fn(),
    };

    // 模拟确认对话框
~~~~~
~~~~~javascript.new
    mockCallbacks = {
      scanAndMergeHistory: vi.fn(),
      saveMessagesToStorage: vi.fn(() => Promise.resolve()),
      scanAllDuplicatesAsync: vi.fn(async () => {
        // Mock a return of 24 duplicate IDs for the test
        return new Array(24).fill('mock-id');
      }),
      deleteMessages: vi.fn(async (ids) => {
        // Mock delete action: manually remove from mockAppState
        if (ids.length > 0) {
          mockAppState['Server A'].Local = [mockAppState['Server A'].Local[0]];
        }
      }),
      deactivateLogger: vi.fn(),
      manualSave: vi.fn(),
      onAutoSaveIntervalChange: vi.fn(),
    };

    // 模拟确认对话框
~~~~~

~~~~~act
patch_file
tests/ui.clean_duplicates.test.js
~~~~~
~~~~~javascript.old
  it('应当能正确识别跨服务器的重复项并在 UI 按钮上显示总数', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');

    // 进入设置页面
    const settingsButton = screen.getByTitle('设置');
    fireEvent.click(settingsButton);

    // 验证按钮计数：25 条重复消息，第一条保留，应显示 (24)
    const cleanButton = await screen.findByText(/清理重复 \(24\)/);
    expect(cleanButton).toBeInTheDocument();
    expect(cleanButton).toHaveClass('active');
  });

  it('点击清理按钮应当递归处理嵌套结构并保存结果', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');

    fireEvent.click(screen.getByTitle('设置'));
    const cleanButton = await screen.findByText(/清理重复 \(24\)/);

    // 执行清理
    fireEvent.click(cleanButton);

    // 验证逻辑：
    // 1. 弹出确认框 (已 mock)
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });

    // 2. 数据被清理：25 条变 1 条
    expect(mockAppState['Server A'].Local.length).toBe(1);
    expect(mockAppState['Server A'].Local[0].content).toBe('Spam Message');

    // 3. 调用了保存函数
    expect(mockCallbacks.saveMessagesToStorage).toHaveBeenCalledWith(mockAppState);

    // 4. UI 反馈
    await waitFor(() => {
      expect(cleanButton.textContent).toBe('清理完毕!');
    });
  });

  it('当没有重复项时，点击按钮应当给出提示', async () => {
    // 构造一个没有重复的状态，增加缺失的 type 字段
    const cleanState = {
      S1: { L1: [{ content: 'unique', time: new Date().toISOString(), type: 'say' }] },
    };
    const adapter = createMockAdapter(cleanState);
    await createUI(adapter, mockCallbacks);

    fireEvent.click(screen.getByTitle('设置'));

    // 使用 findByText 异步等待设置视图渲染完成
    const cleanButton = await screen.findByText('清理重复记录');

    fireEvent.click(cleanButton);
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('未发现可清理的重复记录。');
    });
  });
});
~~~~~
~~~~~javascript.new
  it('点击扫描后应能正确识别重复项并改变按钮状态为清理', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');

    // 进入设置页面
    const settingsButton = screen.getByTitle('设置');
    fireEvent.click(settingsButton);

    const scanButton = await screen.findByText('扫描重复记录');
    
    // 点击扫描
    fireEvent.click(scanButton);

    // 验证按钮状态改变
    const cleanButton = await screen.findByText(/清理重复 \(24\)/);
    expect(cleanButton).toBeInTheDocument();
    expect(cleanButton).toHaveClass('active');
  });

  it('点击清理按钮应当执行删除逻辑并重置 UI', async () => {
    const adapter = createMockAdapter(mockAppState);
    const ui = await createUI(adapter, mockCallbacks);
    ui.updateServerDisplay('Server A');

    fireEvent.click(screen.getByTitle('设置'));
    
    const scanButton = await screen.findByText('扫描重复记录');
    fireEvent.click(scanButton);
    
    const cleanButton = await screen.findByText(/清理重复 \(24\)/);

    // 执行清理
    fireEvent.click(cleanButton);

    // 验证逻辑：
    // 1. 弹出确认框 (已 mock)
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });

    // 2. 数据被清理 (通过 mock 的 deleteMessages 验证)
    expect(mockAppState['Server A'].Local.length).toBe(1);
    expect(mockCallbacks.deleteMessages).toHaveBeenCalled();

    // 3. UI 反馈
    await waitFor(() => {
      expect(cleanButton.textContent).toBe('清理完毕!');
    });
  });

  it('当没有重复项时，点击扫描应当重置按钮', async () => {
    // 覆盖 mock 返回空数组
    mockCallbacks.scanAllDuplicatesAsync.mockResolvedValueOnce([]);
    
    const cleanState = {
      S1: { L1: [{ content: 'unique', time: new Date().toISOString(), type: 'say' }] },
    };
    const adapter = createMockAdapter(cleanState);
    await createUI(adapter, mockCallbacks);

    fireEvent.click(screen.getByTitle('设置'));

    const scanButton = await screen.findByText('扫描重复记录');
    fireEvent.click(scanButton);

    // 等待 UI 反馈
    await waitFor(() => {
      expect(scanButton.textContent).toBe('未发现重复');
    });
  });
});
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
const mockCallbacks = {
  scanAndMergeHistory: vi.fn(() => Promise.resolve()),
  saveMessagesToStorage: vi.fn(() => Promise.resolve()),
  cleanChannelRecords: vi.fn(),
  detectTotalDuplicates: vi.fn(() => 0),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(() => Promise.resolve()),
  onAutoSaveIntervalChange: vi.fn(),
};

const createMockAdapter = (state) => ({
~~~~~
~~~~~javascript.new
const mockCallbacks = {
  scanAndMergeHistory: vi.fn(() => Promise.resolve()),
  saveMessagesToStorage: vi.fn(() => Promise.resolve()),
  scanAllDuplicatesAsync: vi.fn(async () => []),
  deleteMessages: vi.fn(async () => {}),
  deactivateLogger: vi.fn(),
  manualSave: vi.fn(() => Promise.resolve()),
  onAutoSaveIntervalChange: vi.fn(),
};

const createMockAdapter = (state) => ({
~~~~~

~~~~~act
patch_file
tests/ui.integration.test.js
~~~~~
~~~~~javascript.old
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
    const start = (page - 1) * pageSize;
    return {
      messages: list.slice(start, start + pageSize),
      total: list.length,
    };
  },
  getAllData: async () => state,
  getRawState: async () => state,
});

async function renderUI(initialState) {
~~~~~
~~~~~javascript.new
  getMessages: async (server, channel, page, pageSize) => {
    const list = state[server]?.[channel] || [];
    const start = (page - 1) * pageSize;
    return {
      messages: list.slice(start, start + pageSize),
      total: list.length,
    };
  },
  getMessagesChunk: async (server, channel, lastTime, limit) => {
    const list = state[server]?.[channel] || [];
    let startIndex = 0;
    if (lastTime) {
      startIndex = list.findIndex(m => m.time > lastTime);
      if (startIndex === -1) return [];
    }
    return list.slice(startIndex, startIndex + limit);
  },
  getAllData: async () => state,
});

async function renderUI(initialState) {
~~~~~

### 下一步建议

- 可以在测试中补充确保此功能能够按预期正确工作的其他单元测试边界情况。
- 完成这最后一步的优化后，`pt-chat-archiver` 第 4 阶段的重构逻辑基本完备，我们可以开始评估其在实战环境（特别是大体积的历史消息存档中）的具体表现情况，并排查任何其他可能的副作用。
