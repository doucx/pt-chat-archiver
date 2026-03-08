## [WIP] fix: 彻底消除初始化盲区与实时消息重复插入问题

### 错误分析

1.  **初始化交接盲区**: 在 `scanAndMergeHistory` 异步执行期间，新产生的消息既不会被包含在已生成的历史快照中，也会因为 `isInitializingChat` 仍为 `true` 而被实时监听器丢弃，导致数据丢失。
2.  **解封冲突**: 当 `isInitializingChat` 变为 `false` 时，若仍有历史消息在延迟渲染，实时监听器（通道 B）会将其误认为新消息。由于通道 B 缺乏查重机制且会赋予新时间戳，这导致了数据库被虚假的“新消息”污染，进而引发后续的循环重复。

### 用户需求

确保在开关聊天框、进入游戏等时刻，消息既不丢失也不重复。新旧消息的切换应当是平滑且具备自愈能力的。

### 评论

这是对“核心假设”的重构。我们将不再信任“时间上的先后顺序”来区分新旧消息，而是信任“内容指纹”。

### 目标

1.  **为实时监听引入查重逻辑**: 每次实时捕获消息时，先检查数据库中最近的几条记录，若重复则拒绝插入。
2.  **优化初始化交接逻辑**: 缩短 `isInitializingChat` 的锁定时间，利用通道 B 的查重能力来平滑衔接历史扫描。

### 基本原理

利用我们之前引入的 IndexedDB 内存缓存和高效的 `getLatestMessages`，实时查重的成本极低（毫秒级）。有了这个安全网，我们就不再害怕“误抓”旧消息，系统将变得极其健壮。

### 标签

#intent/fix #flow/ready #priority/critical #comp/engine #concept/sync #scope/core #ai/delegate #task/domain/sync #task/object/handover-logic #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 为实时监听添加防重安全网

修改 `main.js` 中的 `handleNewChatMessage`。在每一条实时消息进入数据库前，增加一次与最近记录的对比。由于使用了缓存，这个操作非常快。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript
    const selfName = (await storageManager.getSelfName()) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      messageData.server = detectedServerName;
      messageData.channel = currentActiveChannel;

      await storageManager.putMessage(messageData);
~~~~~
~~~~~javascript
    const selfName = (await storageManager.getSelfName()) || '';
    const preciseTime = getISOTimestamp();
    const messageData = extractUsefulData(node, selfName, preciseTime);

    if (messageData?.content) {
      messageData.server = detectedServerName;
      messageData.channel = currentActiveChannel;

      // --- 实时防重检查 ---
      // 获取最近的 10 条记录进行比对，防止误抓延迟渲染的旧消息
      const recentMessages = await storageManager.getLatestMessages(
        messageData.server,
        messageData.channel,
        10
      );
      
      const isDuplicate = recentMessages.some(m => 
        m.sender === messageData.sender && 
        m.content === messageData.content
      );

      if (isDuplicate) {
        // console.log('[Archiver] 实时监听拦截到重复消息，已忽略:', messageData.content);
        return;
      }

      await storageManager.putMessage(messageData);
~~~~~

#### Acts 2: 优化初始化交接时序

修改 `main.js` 中的 `activateLogger`。将 `isInitializingChat` 的解锁时机提前，利用实时查重逻辑来覆盖异步扫描期间的盲区。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript
    const finalizeInitialization = debounce(async () => {
      await scanAndMergeHistory();
      isInitializingChat = false;
    }, 500);
~~~~~
~~~~~javascript
    const finalizeInitialization = debounce(async () => {
      // 关键：在开始异步扫描前就解锁实时监听。
      // 通道 B 现在有了实时查重，它会自动处理与扫描快照重叠的消息。
      // 这彻底消除了之前在 await 期间的消息丢失盲区。
      isInitializingChat = false; 
      await scanAndMergeHistory();
    }, 500);
~~~~~

### 下一步建议

这两项修改直接打破了导致重复加载的“死循环”。现在：
1.  **延迟渲染的消息**会被通道 B 识别并因为内容重复被拦截。
2.  **真正的实时新消息**即使在扫描期间产生，也会因为 `isInitializingChat` 已提前设为 `false` 而被通道 B 捕获，不再丢失。

建议你在手机端疯狂测试开关操作，观察控制台是否还有警告。如果有，我们需要进一步调优 500ms 的防抖参数。
