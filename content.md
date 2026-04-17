这是一个非常典型的回归 Bug。在之前的重构中，`refreshView` 函数在 `stats`（统计）模式下进行大批量数据拉取时，将 `onProgress` 回调函数硬编码为了 `null`。

此外，我还发现了一个相关的隐藏缺陷：`StorageManager` 和 `main.js` 中的数据适配器层都没有正确向下透传 `offsetOverride` 参数，这会导致统计数据在消息总数超过上限时无法准确定位到“最后 N 条”。

我将生成一个计划来修复进度条显示，并打通参数透传链路。

## [WIP] fix(ui): 修复统计模式下的加载进度条缺失及偏移量丢失问题

### 错误分析

1.  **进度条缺失**: 在 `src/ui/index.js` 的 `refreshView` 控制器逻辑中，当 `viewMode` 为 `stats` 时，调用 `dataAdapter.getMessages` 时传入的第五个参数为 `null`。这导致 `IndexedDBAdapter` 虽然在后台分块读取数据，但无法向 UI 反馈进度，用户只能看到静态的“正在准备读取数据”提示，在大数据量下显得像界面卡死。
2.  **偏移量失效**: `stats` 模式依赖 `offset` 参数来拉取最后的 N 条消息。然而，`src/storage/index.js` 中的 `StorageManager` 和 `src/main.js` 中的 `dataAdapter` 定义都只接收了 5 个参数，导致 `src/ui/index.js` 传出的 `offset` 在中途丢失，未能抵达底层的 `IndexedDBAdapter`。

### 用户需求

修复统计分析功能，使其在大数据量读取时重新显示进度条，并确保统计的是正确的“最后 N 条”记录。

### 评论

对于大数据量（如 5000+ 条）的统计分析，实时的进度反馈对用户体验至关重要。同时，修复 `offset` 透传确保了统计功能的正确性。

### 目标

1.  修改 `StorageManager` 以支持 `offsetOverride` 透传。
2.  修改 `main.js` 适配器以支持 `offsetOverride` 透传。
3.  在 `src/ui/index.js` 中为统计模式添加与日志模式一致的进度条渲染回调。

### 基本原理

通过打通从 UI 层到存储层的参数链路，确保 `offset` 能够正确生效。同时，通过向 `getMessages` 注入进度回调函数，利用 `dom.logDisplay` 实时渲染进度条。

### 标签

#intent/fix #flow/ready #priority/medium #comp/ui #comp/engine #concept/executor #scope/ux #ai/instruct #task/domain/ui #task/object/progress-bar #task/action/bug-fix #task/state/begin

---

### Script

#### Acts 1: 打通存储层与适配器的参数链路

首先，我们需要确保 `offsetOverride` 参数能够从 UI 穿透到真实的适配器。

~~~~~act
patch_file
src/storage/index.js
~~~~~
~~~~~javascript.old
  getMessages(server, channel, page, pageSize, onProgress) {
    if (this.adapter?.getMessages)
      return this.adapter.getMessages(server, channel, page, pageSize, onProgress);
    return Promise.resolve({ messages: [], total: 0 });
  }
~~~~~
~~~~~javascript.new
  getMessages(server, channel, page, pageSize, onProgress, offsetOverride) {
    if (this.adapter?.getMessages)
      return this.adapter.getMessages(
        server,
        channel,
        page,
        pageSize,
        onProgress,
        offsetOverride,
      );
    return Promise.resolve({ messages: [], total: 0 });
  }
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
      getMessages: async (server, channel, page, pageSize, onProgress) => {
        return await storageManager.getMessages(server, channel, page, pageSize, onProgress);
      },
~~~~~
~~~~~javascript.new
      getMessages: async (server, channel, page, pageSize, onProgress, offsetOverride) => {
        return await storageManager.getMessages(
          server,
          channel,
          page,
          pageSize,
          onProgress,
          offsetOverride,
        );
      },
~~~~~

#### Acts 2: 修复 UI 层的进度回调逻辑

现在，我们在 `refreshView` 的统计模式分支中注入进度条渲染逻辑。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
        const result = await dataAdapter.getMessages(currentServer, selectedChannel, fetchPage, fetchSize, null, offset);
~~~~~
~~~~~javascript.new
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
            dom.logDisplay.value = `⏳ 正在读取统计数据...\n\n    ${bar} ${Math.round(
              percentage * 100,
            )}%\n    已读取: ${current} / ${total} 条`;
          },
          offset,
        );
~~~~~

### 下一步建议

- **功能验证**: 切换到“统计”模式，并将统计上限调高（如 10000），观察文本框内是否出现了类似 `[#####-----] 50%` 的进度条。
- **性能评估**: 如果发现进度条更新导致界面抖动太剧烈，可以考虑在 `IndexedDBAdapter` 中增加进度汇报的频率限制。
- **Git 提交**: 验证无误后，我将为您准备 `[COMMIT]` 计划。
