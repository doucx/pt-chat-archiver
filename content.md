测试超时是因为 `putMessage` 测试中调用了 `adapter.getServers()`，而 `getServers` 会检查 `this.cache.servers`。由于初始状态下 `this.cache.servers` 是 `null`，它会尝试发起 IDB 请求并等待游标回调。但我们的 Mock 并没有模拟游标遍历触发 `onsuccess`，导致 Promise 永远处于 pending 状态。

我将修改断言，直接验证 `adapter.cache.channels`（它在初始状态下是一个空对象 `{}`，`_updateCache` 会成功向其中添加数据），从而避开需要深层 Mock 游标遍历的陷阱。

## [WIP] fix(storage): 修复测试中的游标等待超时

### 用户需求
修复由于异步游标 Mock 不完整导致的测试超时问题。

### 评论
在针对异步代码编写测试时，特别是涉及到原生事件回调（如 IDB 的 `onsuccess`），如果没有完美地模拟事件流，极易导致 Promise 挂起。通过断言我们确定能掌控的副作用（即 `this.cache.channels` 的变化），我们可以绕过复杂的流程，直达测试目的。

### 目标
1. 修改 `putMessage` 测试用例，将其断言从调用 `getServers()` 改为直接检查缓存字典。

### 标签
#intent/fix #flow/ready #priority/high #comp/tests #concept/state #task/domain/storage #task/object/indexed-db-adapter #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 修改由于 Mock 不全导致超时的测试用例

~~~~~act
patch_file
tests/storage/indexed-db.test.js
~~~~~
~~~~~javascript.old
      expect(mockDb.transaction).toHaveBeenCalledWith([STORE_MESSAGES], 'readwrite');
      expect(mockStore.put).toHaveBeenCalledWith(expect.objectContaining({ content: 'hello' }));
      
      // 验证缓存是否更新
      const servers = await adapter.getServers();
      expect(servers).toContain('S1');
    });

    it('deleteMessages 应当在事务完成后 resolve', async () => {
~~~~~
~~~~~javascript.new
      expect(mockDb.transaction).toHaveBeenCalledWith([STORE_MESSAGES], 'readwrite');
      expect(mockStore.put).toHaveBeenCalledWith(expect.objectContaining({ content: 'hello' }));
      
      // 验证缓存是否更新，由于 cache.servers 初始为 null 需要懒加载，
      // 我们这里直接验证 cache.channels 是否被正确填充
      expect(adapter.cache.channels['S1']).toContain('C1');
    });

    it('deleteMessages 应当在事务完成后 resolve', async () => {
~~~~~

### 下一步建议
测试通过后，即可将此重构作为一个完整的 commit 提交。然后我们可以进入下一步，提取 `ui/index.js` 中的文件导出等重型 I/O 逻辑。
