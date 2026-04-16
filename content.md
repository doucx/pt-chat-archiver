这是一个绝佳的用户体验改进。将原先一直处于“死锁”状态的加载过程拆分为更细的块，不仅可以提供可视化的进度反馈，同时由于“让出主线程 (yield)”，能大幅减少应用无响应（ANR）的情况。

为了实现这一点而尽量不对原有的底层查询产生负面性能影响，我们需要将 `getMessages` 设计为**条件分片执行**：当不需要进度时（比如在后台进行查重），依然走原生的一体化事务保障极致速度；而在 UI 需要展示时，则切分为小的事务进行查询并汇报进度。因为 `IndexedDB` 借助 `advance()` 方法重新定位游标依然极其迅速，这么做并不会造成显著开销。

## [WIP] feat: 增加 TUI 风格的历史记录加载进度条

### 用户需求

在手机等弱性能设备上加载历史记录可能会花费 500ms 甚至更多时间，期间如果只显示固定占位符会让用户误以为卡死。需要加入诸如 `[####      ] 40% (400/1000)` 的 TUI 文本进度条，以增强感知体验。

### 评论

非常合理的改进。这种分片异步处理方法也恰好契合了前端“Time Slicing（时间切片）”的最佳实践，能在防止主线程长任务阻塞上起到立竿见影的效果。

### 目标

1. 将 `IndexedDBAdapter.js` 中的 `getMessages` 重构为允许分块查库，并支持向上传递 `onProgress` 回调。
2. 将抽离的游标事务抽取到 `_getMessagesSingleTx` 作为基础查询单元。
3. 更新 `storageManager` 与 `DataAdapter` 的接口，允许在各层之间传递 `onProgress` 参数。
4. 在 `ui/index.js` 的 `refreshView` 环节利用回调生成 TUI 的文本进度条并同步给 textarea，让用户可以感知进度。
5. 添加“构建文本视图”过渡动画，缓解长列表拼接（`join`）带来的主线程停顿感。

### 基本原理

由于 IndexedDB 规范规定一旦微任务队列清空事务就会被自动提交关闭，我们无法在同一个读取事务内部 `await sleep(0)` 来给 DOM 重绘的机会。
因此，若要达成这一目的并保持性能最优，必须通过多次创建微小的只读事务进行分片拉取：
- 每次只拉取 250 条。
- 使用 `cursor.advance(skip)` 快速跳过已读取的部分（此操作在浏览器 C++ 底层执行，非常快）。
- 每拉完一片，让出主线程 `await new Promise(r => setTimeout(r, 0))` 给予 DOM 重绘进度条的机会，然后循环开始下一片。

### 标签

#intent/build #flow/ready #priority/high #comp/runtime #comp/ui #scope/ux #ai/brainstorm #task/domain/ui #task/object/progress-bar #task/action/integration #task/state/begin

---

### Script

#### Acts 1: 重构 IndexedDBAdapter 中的游标逻辑
抽离出一个底层方法 `_getMessagesSingleTx`，并让外部 `getMessages` 根据是否传入回调决定走优化流还是分片流。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
  getMessages(server, channel, page, pageSize) {
    if (!server || !channel) return Promise.resolve({ messages: [], total: 0 });
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);

      const countReq = index.count(range);
      countReq.onsuccess = () => {
        const total = countReq.result;
        const messages = [];
        const start = (page - 1) * pageSize;

        if (start >= total || total === 0) {
          return resolve({ messages, total });
        }

        // 核心优化：双向游标
        // 当需要跳过的记录数超过总数的一半时，改为从末尾反向遍历，大幅减少光标 advance() 的性能损耗。
        const reverse = start > total / 2;
        let direction = 'next';
        let advanceCount = start;

        if (reverse) {
          direction = 'prev';
          const lastIndexWanted = Math.min(start + pageSize - 1, total - 1);
          advanceCount = total - 1 - lastIndexWanted;
        }

        const cursorReq = index.openCursor(range, direction);
        let advanced = false;

        cursorReq.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) {
            if (reverse) messages.reverse();
            return resolve({ messages, total });
          }
          if (advanceCount > 0 && !advanced) {
            advanced = true;
            cursor.advance(advanceCount);
          } else {
            messages.push(cursor.value);
            if (messages.length < pageSize) {
              cursor.continue();
            } else {
              if (reverse) messages.reverse();
              resolve({ messages, total });
            }
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  }
~~~~~
~~~~~javascript.new
  getMessages(server, channel, page, pageSize, onProgress) {
    if (!server || !channel) return Promise.resolve({ messages: [], total: 0 });
    return new Promise(async (resolve, reject) => {
      try {
        const total = await this.getChannelCount(server, channel);
        const messages = [];
        const start = (page - 1) * pageSize;

        if (start >= total || total === 0) {
          return resolve({ messages, total });
        }

        // 核心优化：双向游标
        const reverse = start > total / 2;
        let direction = 'next';
        let advanceCount = start;

        if (reverse) {
          direction = 'prev';
          const lastIndexWanted = Math.min(start + pageSize - 1, total - 1);
          advanceCount = total - 1 - lastIndexWanted;
        }

        // 如果没有进度汇报需求，执行单次优化读取
        if (!onProgress) {
          const result = await this._getMessagesSingleTx(server, channel, advanceCount, pageSize, direction, total, reverse);
          return resolve(result);
        }

        // 分块读取以支持进度汇报，避免长时间阻塞主线程
        const chunkSize = 250;
        const totalToFetch = Math.min(pageSize, total - start);
        let currentSkip = advanceCount;

        while (messages.length < totalToFetch) {
          const limit = Math.min(chunkSize, totalToFetch - messages.length);
          const chunkResult = await this._getMessagesSingleTx(server, channel, currentSkip, limit, direction, total, false);
          
          if (chunkResult.messages.length === 0) break;
          
          messages.push(...chunkResult.messages);
          currentSkip += chunkResult.messages.length;
          
          if (onProgress) {
            onProgress(messages.length, totalToFetch);
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        if (reverse) {
          messages.reverse();
        }

        resolve({ messages, total });
      } catch (err) {
        reject(err);
      }
    });
  }

  _getMessagesSingleTx(server, channel, advanceCount, limit, direction, total, reverseResult) {
    return new Promise((resolve, reject) => {
      const tx = this._tx([STORE_MESSAGES], 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('server_channel_time');
      const range = IDBKeyRange.bound([server, channel, ''], [server, channel, '\uffff']);
      
      const cursorReq = index.openCursor(range, direction);
      let advanced = false;
      const messages = [];
      
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          if (reverseResult) messages.reverse();
          return resolve({ messages, total });
        }
        if (advanceCount > 0 && !advanced) {
          advanced = true;
          cursor.advance(advanceCount);
        } else {
          messages.push(cursor.value);
          if (messages.length < limit) {
            cursor.continue();
          } else {
            if (reverseResult) messages.reverse();
            resolve({ messages, total });
          }
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }
~~~~~

#### Acts 2: 拓展 Storage 门面层的签名
在 `storageManager` 中更新签名以向下转发参数。

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  getMessages(server, channel, page, pageSize) {
    if (this.adapter?.getMessages) return this.adapter.getMessages(server, channel, page, pageSize);
    return Promise.resolve({ messages: [], total: 0 });
  }
~~~~~
~~~~~javascript.new
  getMessages(server, channel, page, pageSize, onProgress) {
    if (this.adapter?.getMessages) return this.adapter.getMessages(server, channel, page, pageSize, onProgress);
    return Promise.resolve({ messages: [], total: 0 });
  }
~~~~~

#### Acts 3: 拓展 Main 中提供的 DataAdapter 回调
确保暴露给 UI 层的适配器可以接收并转发此回调。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
      getMessages: async (server, channel, page, pageSize) => {
        return await storageManager.getMessages(server, channel, page, pageSize);
      },
~~~~~
~~~~~javascript.new
      getMessages: async (server, channel, page, pageSize, onProgress) => {
        return await storageManager.getMessages(server, channel, page, pageSize, onProgress);
      },
~~~~~

#### Acts 4: 在 UI 中计算并绘制 TUI 进度条
修改核心调度函数，动态计算并显示加载进度与最终渲染过渡页。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      // 渲染非阻塞化：显示加载骨架状态并让出主线程，允许浏览器重绘
      dom.logDisplay.value = '⏳ 数据加载与处理中...';
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (renderId !== currentRenderId) return; // 竞态控制：丢弃过期的渲染请求

      // 如果是 stats 模式，可能需要全量数据 (Phase 1 临时兼容)
      const fetchSize = viewMode === 'stats' ? 999999 : pageSize;
      const fetchPage = viewMode === 'stats' ? 1 : currentPage;

      const result = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        fetchPage,
        fetchSize,
      );

      if (renderId !== currentRenderId) return;

      messages = result.messages;
      totalCount = result.total; // 确保一致性
    }
~~~~~
~~~~~javascript.new
    // 当且仅当非 config 模式下才去抓取具体消息体
    if (currentServer && selectedChannel && viewMode !== 'config') {
      // 渲染非阻塞化：显示准备读取的状态并让出主线程
      dom.logDisplay.value = '⏳ 正在准备读取数据...';
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (renderId !== currentRenderId) return; // 竞态控制：丢弃过期的渲染请求

      // 如果是 stats 模式，可能需要全量数据 (Phase 1 临时兼容)
      const fetchSize = viewMode === 'stats' ? 999999 : pageSize;
      const fetchPage = viewMode === 'stats' ? 1 : currentPage;

      const result = await dataAdapter.getMessages(
        currentServer,
        selectedChannel,
        fetchPage,
        fetchSize,
        (current, total) => {
          if (renderId !== currentRenderId) return;
          const width = 20;
          const percentage = current / total;
          const filled = Math.round(width * percentage);
          const empty = width - filled;
          const bar = `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
          dom.logDisplay.value = `⏳ 正在读取历史记录...\n\n    ${bar} ${Math.round(percentage * 100)}%\n    已读取: ${current} / ${total} 条`;
        }
      );

      if (renderId !== currentRenderId) return;

      messages = result.messages;
      totalCount = result.total; // 确保一致性
      
      // 过渡状态：渲染文本往往也很耗时
      dom.logDisplay.value = '⏳ 数据读取完毕，正在构建文本视图...';
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
~~~~~

### 下一步建议

现在读取速度被以可视化的方式展示出来，不仅缓解了用户在长加载期间感到的“卡死焦虑”，甚至让手机用户感觉到设备一直在努力工作。
请在测试后反馈体验，如果没有问题，我可以为您创建提交信息的计划。
