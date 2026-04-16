你的分析非常准确。在 `src/storage/indexed-db-adapter.js` 中的 `getMessages` 方法使用了 `async` 作为 `Promise` 的执行器（executor），这在现代 JavaScript 实践中被视为一种反模式。

主要的风险在于：如果 `async` 执行器内部抛出了未捕获的错误，该 Promise 不会自动进入 `rejected` 状态，这可能导致调用方永久挂起。更优雅的做法是将该方法本身标记为 `async`，并移除冗余的 `new Promise` 包装。

我将生成一个计划来重构此方法。

## [WIP] fix: 重构 IndexedDBAdapter 中的异步 Promise 执行器

### 错误分析

在 `src/storage/indexed-db-adapter.js` 的第 201 行，`getMessages` 方法返回了一个 `new Promise`，其执行器是一个 `async` 函数。

**风险点**：
1. **错误捕获失效**：如果 `async` 执行器在 `try` 块之外或在某些特定异步边界发生错误，Promise 容器无法自动捕获该异常并执行 `reject`。
2. **逻辑冗余**：既然函数内部已经在使用 `await` 处理异步逻辑，直接将外部函数声明为 `async` 并返回结果是更简洁、更符合标准的做法。
3. **Lint 违规**：Biome 静态检查工具识别出此模式并报告了 `lint/suspicious/noAsyncPromiseExecutor` 错误，阻止了构建流程。

### 用户需求
修复 Biome 检查报告的 `noAsyncPromiseExecutor` 错误，并确保 `getMessages` 方法的逻辑在重构后依然保持正确且健壮。

### 评论
这是一个典型的由于异步代码演进产生的结构性冗余。通过将该方法转为标准的 `async` 函数，不仅能消除 Lint 警告，还能提升代码的可读性和错误处理的可靠性。

### 目标
1. 将 `getMessages` 方法标记为 `async`。
2. 移除 `new Promise(async (resolve, reject) => { ... })` 包装层。
3. 将内部所有的 `resolve(data)` 替换为 `return data`，并将 `reject(err)` 替换为 `throw err`。
4. 调整受影响代码块的缩进。

### 基本原理
`async` 函数天然返回一个 Promise。在 `async` 函数内部，直接 `return` 相当于 `resolve`，直接 `throw` 相当于 `reject`。这样我们可以利用语言原生的机制来替代手动的 Promise 构造。

### 标签
#intent/fix #flow/ready #priority/high #comp/engine #concept/state #scope/core #ai/refine #task/domain/storage #task/object/indexed-db-adapter #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 重构 `getMessages` 方法

我们将修改 `src/storage/indexed-db-adapter.js`，通过将 `getMessages` 转换为 `async` 函数来移除不安全的 Promise 执行器。

~~~~~act
patch_file
src/storage/indexed-db-adapter.js
~~~~~
~~~~~javascript.old
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
          const result = await this._getMessagesSingleTx(
            server,
            channel,
            advanceCount,
            pageSize,
            direction,
            total,
            reverse,
          );
          return resolve(result);
        }

        // 分块读取以支持进度汇报，避免长时间阻塞主线程
        const chunkSize = 250;
        const totalToFetch = Math.min(pageSize, total - start);
        let currentSkip = advanceCount;

        while (messages.length < totalToFetch) {
          const limit = Math.min(chunkSize, totalToFetch - messages.length);
          const chunkResult = await this._getMessagesSingleTx(
            server,
            channel,
            currentSkip,
            limit,
            direction,
            total,
            false,
          );

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
~~~~~
~~~~~javascript.new
  async getMessages(server, channel, page, pageSize, onProgress) {
    if (!server || !channel) return { messages: [], total: 0 };
    try {
      const total = await this.getChannelCount(server, channel);
      const messages = [];
      const start = (page - 1) * pageSize;

      if (start >= total || total === 0) {
        return { messages, total };
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
        const result = await this._getMessagesSingleTx(
          server,
          channel,
          advanceCount,
          pageSize,
          direction,
          total,
          reverse,
        );
        return result;
      }

      // 分块读取以支持进度汇报，避免长时间阻塞主线程
      const chunkSize = 250;
      const totalToFetch = Math.min(pageSize, total - start);
      let currentSkip = advanceCount;

      while (messages.length < totalToFetch) {
        const limit = Math.min(chunkSize, totalToFetch - messages.length);
        const chunkResult = await this._getMessagesSingleTx(
          server,
          channel,
          currentSkip,
          limit,
          direction,
          total,
          false,
        );

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

      return { messages, total };
    } catch (err) {
      throw err;
    }
  }
~~~~~

### 下一步建议
- **运行 Lint 检查**：应用此更改后，再次运行 `npm run checkf` 以确认该错误已被消除。
- **功能验证**：由于修改了核心数据读取逻辑，建议打开项目并在 UI 中尝试翻页、切换服务器和频道，确保聊天记录加载依然正常。
- **查看 `_getMessagesSingleTx`**：注意到该私有方法虽然没有被标记为 `async` 但返回了 `Promise`。虽然目前没有报错，但为了风格统一，未来也可以将其重构为 `async` 形式。
