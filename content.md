## [WIP] fix: 修复反复开关聊天框导致的记录疯狂重复与去重失效问题

### 错误分析

核心问题由三部分构成：
1. `scanAndMergeHistory` 缺乏并发控制，快速开关聊天框会导致大量并行的读取-合并-写入流程，它们基于相同的 DOM 但生成不同的 ULID，最终被重复存入 IndexedDB。
2. `mergeAndDeduplicateMessages` 使用严格的前后缀匹配。一旦数据库中丢失了某条中间消息，前后缀匹配将完全失败，返回 0 重叠。这不仅会错误地抛出断层警告，还会导致整个 DOM 记录被重复追加。
3. `analysis.js` 中的去重扫描包含 `!record.is_historical` 的硬性限制，使得它对扫描解析器产生的故障副本完全免疫，无法发挥清理作用。

### 用户需求

解决由于反复开关聊天框或进入游戏时导致的聊天记录重复加载问题，并使“扫描重复记录”功能能够发现并清理这些重复的历史记录。确保历史记录能按加载顺序正确统一分配时间戳。

### 评论

这是一个极高优先级的修复，它直接影响了数据的正确性和清洁度。尤其是移动端用户，频繁呼出和隐藏聊天框是非常自然的操作，目前的 Bug 会迅速导致数据库被垃圾数据填满。

### 目标

1. 在 `main.js` 中为 `scanAndMergeHistory` 实现互斥锁，防止并发执行。
2. 在 `state.js` 中重写 `mergeAndDeduplicateMessages` 的对齐算法，使其能够容忍数据缺失。
3. 在 `analysis.js` 中移除针对历史标记的去重免疫限制。

### 基本原理

通过互斥锁，我们确保数据合并永远是原子的。通过贪心对齐算法，我们能够精确找出 DOM 中哪些消息是数据库中没有的，将它们挑出并加入到待存列表，而不是因为一个匹配失败就一股脑全加。放开去重限制，配合现有的极短时间阈值判断，可以在不误伤正常聊天的前提下，快速清理之前因 Bug 产生的冗余数据。

### 标签

#intent/fix #flow/ready #priority/critical #comp/engine #concept/sync #concept/state #scope/core #ai/delegate #task/domain/sync #task/object/history-merger #task/action/fix #task/state/begin

---

### Script

#### Acts 1: 放开重复记录清理功能的历史限制

移除 `analysis.js` 中阻止历史记录被清理的逻辑，以便用户可以使用 UI 的清理按钮删除受 Bug 影响而产生的旧重复记录。

~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript
        const content = record.content;
        const is_duplicate = content != null && seen_contents.has(content);
        const should_delete = !record.is_historical && is_duplicate && is_in_burst[i];

        if (should_delete) {
~~~~~
~~~~~javascript
        const content = record.content;
        const is_duplicate = content != null && seen_contents.has(content);
        // 放开限制：允许清理故障产生的、且处于爆发期的重复历史记录
        const should_delete = is_duplicate && is_in_burst[i];

        if (should_delete) {
~~~~~

~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript
    const content = record.content;
    const is_duplicate = content != null && seen_contents.has(content);
    // 只有非历史导入的、且处于爆发期的重复消息才会被删除
    const should_delete = !record.is_historical && is_duplicate && is_in_burst[i];

    if (!should_delete) {
~~~~~
~~~~~javascript
    const content = record.content;
    const is_duplicate = content != null && seen_contents.has(content);
    // 允许清理所有处于爆发期内的绝对重复记录
    const should_delete = is_duplicate && is_in_burst[i];

    if (!should_delete) {
~~~~~

~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript
      const content = record.content;
      if (
        !record.is_historical &&
        content != null &&
        seen_contents.has(content) &&
        is_in_burst[i]
      ) {
~~~~~
~~~~~javascript
      const content = record.content;
      if (
        content != null &&
        seen_contents.has(content) &&
        is_in_burst[i]
      ) {
~~~~~

#### Acts 2: 修复历史扫描的并发竞争漏洞

在 `main.js` 的 `scanAndMergeHistory` 外部包裹一层执行锁，确保当扫描正在进行时，新的扫描请求会被挂起，并在当前扫描完成后再追加执行一次，从而彻底避免并发读写。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript
  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  async function scanAndMergeHistory() {
    if (!detectedServerName) return;
    const historicalState = await extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
~~~~~
~~~~~javascript
  /**
   * 扫描当前聊天框中的可见消息，并将其与内存状态智能合并。
   */
  let isScanningHistory = false;
  let pendingScan = false;

  async function performScanAndMerge() {
    if (!detectedServerName) return;
    const historicalState = await extractHistoricalChatState();
    let dataChanged = false;

    if (historicalState.current_tab && historicalState.messages.length > 0) {
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript
        }
        dataChanged = true;
      }
    }
    if (dataChanged && uiControls && !uiControls.isUIPaused()) {
      uiControls.updateUI();
    }
  }

  /*
   * =================================================================
~~~~~
~~~~~javascript
        }
        dataChanged = true;
      }
    }
    if (dataChanged && uiControls && !uiControls.isUIPaused()) {
      uiControls.updateUI();
    }
  }

  async function scanAndMergeHistory() {
    if (isScanningHistory) {
      pendingScan = true;
      return;
    }
    isScanningHistory = true;
    try {
      do {
        pendingScan = false;
        await performScanAndMerge();
      } while (pendingScan);
    } finally {
      isScanningHistory = false;
    }
  }

  /*
   * =================================================================
~~~~~

#### Acts 3: 重写重叠匹配算法

在 `state.js` 中替换原有的脆弱的前后缀匹配机制。采用从后向前的贪心对齐策略，智能识别空洞。

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript
  // 3. 重叠检测 (Overlap Detection)
  let overlapLength = 0;
  const maxPossibleOverlap = Math.min(oldSigs.length, newSigs.length);

  for (let i = maxPossibleOverlap; i > 0; i--) {
    // 比较 old 的后缀 和 new 的前缀
    const suffixSigs = oldSigs.slice(-i);
    const prefixSigs = newSigs.slice(0, i);

    // 简单的数组比较
    let match = true;
    for (let k = 0; k < i; k++) {
      if (suffixSigs[k] !== prefixSigs[k]) {
        match = false;
        break;
      }
    }

    if (match) {
      overlapLength = i;
      break;
    }
  }

  // 4. 合并结果
  let messagesToAdd;
  if (overlapLength > 0) {
    // 找到重叠，取 newMessages 中重叠部分之后的消息
    // 注意：我们需要回到原始的 newMessages 数组（包含可能的 archiver 标记，虽然 filter 过了通常没有）
    // 为了简单，我们使用 newUserMessages 的索引来切分 newMessages
    // 但 newMessages 可能包含我们 filter 掉的东西吗？
    // extractHistoricalChatState 生成的消息通常不含 is_archiver。
    // 所以直接用 newUserMessages 的逻辑是安全的。

    // 找到重叠截止点在 newMessages 中的位置
    const lastOverlappingMsg = newUserMessages[overlapLength - 1];
    // 在原始 newMessages 中找到这个消息
    const indexInOriginal = newMessages.indexOf(lastOverlappingMsg);

    if (indexInOriginal !== -1) {
      messagesToAdd = newMessages.slice(indexInOriginal + 1);
    } else {
      // Fallback (should ideally not happen)
      messagesToAdd = newMessages.slice(overlapLength);
    }
  } else {
    messagesToAdd = newMessages;
  }

  if (messagesToAdd.length === 0) return oldMessages;

  const discontinuityDetected = overlapLength === 0;

  if (discontinuityDetected) {
    // 进一步检查：如果只是 overlap 没找到，但时间上是连续的（或者是旧数据的未来），
    // 且我们没有更好的办法判断，才插入标记。
    // 防止“完全不匹配但其实是同一波数据的微调”导致的重复。
    // 但鉴于我们做了子集检测，如果走到这里，说明 new 有 old 没有的内容，且头部不匹配 old 的尾部。
    // 这确实像是一个断层。
    console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
    const discontinuityMark = {
      time: getISOTimestamp(),
      type: 'system',
      sender: 'Archiver',
      receiver: 'System',
      content: '[警告 - 此处可能存在记录丢失]',
      is_archiver: true,
    };
    return ensureIdMonotonicity(oldMessages.concat([discontinuityMark], messagesToAdd));
  }

  return ensureIdMonotonicity(oldMessages.concat(messagesToAdd));
~~~~~
~~~~~javascript
  // 3. 贪心对齐检测 (Greedy Alignment Detection)
  // 从后向前比较，容忍旧数据中的缺失空洞
  let i = oldSigs.length - 1;
  let j = newSigs.length - 1;
  const missingIndices = [];
  let anyMatchFound = false;

  while (j >= 0) {
    if (i >= 0 && oldSigs[i] === newSigs[j]) {
      anyMatchFound = true;
      i--;
      j--;
    } else {
      let foundInOld = -1;
      let foundInNew = -1;

      // 往前探查一小段，确认是哪一侧少了一截
      for (let k = 1; k <= 5 && i - k >= 0; k++) {
        if (oldSigs[i - k] === newSigs[j]) {
          foundInOld = i - k;
          break;
        }
      }
      for (let k = 1; k <= 5 && j - k >= 0; k++) {
        if (i >= 0 && newSigs[j - k] === oldSigs[i]) {
          foundInNew = j - k;
          break;
        }
      }

      if (foundInOld !== -1 && foundInNew === -1) {
        // DB 里有多余的东西（比如以前错误的重复插入），跳过它们
        i = foundInOld;
      } else if (foundInNew !== -1 && foundInOld === -1) {
        // DOM 里有新的、DB 漏掉的消息
        missingIndices.push(j);
        j--;
      } else {
        // 两边都没找到，默认 DOM 里的是新产生的未记录消息
        missingIndices.push(j);
        j--;
      }
    }
  }

  // 恢复正向的时间顺序
  missingIndices.reverse();
  const messagesToAdd = missingIndices.map(idx => newUserMessages[idx]);

  if (messagesToAdd.length === 0) return oldMessages;

  // 只有当两个数组没有任何交集时，才真正认定发生了不可恢复的断层
  const discontinuityDetected = !anyMatchFound;

  if (discontinuityDetected && oldSigs.length > 0) {
    console.warn('检测到聊天记录不连续，可能存在数据丢失。已插入警告标记。');
    const discontinuityMark = {
      time: getISOTimestamp(),
      type: 'system',
      sender: 'Archiver',
      receiver: 'System',
      content: '[警告 - 此处可能存在记录丢失]',
      is_archiver: true,
    };
    return ensureIdMonotonicity(oldMessages.concat([discontinuityMark], messagesToAdd));
  }

  // 利用 ensureIdMonotonicity，所有新增历史记录的 ID 和 Time 将被安全地推挤
  // 从而使得这些补漏记录会被安插在正确的时间线位置（最后一条有效记录之后）
  return ensureIdMonotonicity(oldMessages.concat(messagesToAdd));
~~~~~

### 下一步建议

现在你可以前往设置页面点击“**扫描重复记录**”。随着我们的更新，它现在有能力彻底清理掉被多次错误加载产生的巨量重复垃圾数据了。完成后，可以多尝试切换标签页或隐藏呼出面板来测试并发问题的修复情况。由于修改了核心逻辑，我将生成 `[COMMIT]` 计划以保存进度。

---

这是一个非常经典且复杂的并发竞争（Race Condition）与对齐算法缺陷交织导致的 Bug。你的观察非常敏锐，特别是关于时间戳排序和重复扫描失效的发现，直指问题的核心。

### 为什么会出现重复加载现象？

1. **并发竞态条件 (Race Condition)**
   在 `main.js` 中，每次 UI 显示（如手机端开关聊天框）或检测到标签页切换时，都会触发 `scanAndMergeHistory()`。由于该函数是异步的，并且缺乏全局锁，当你在手机端快速、反复地开关聊天框时，会引发**多个 `scanAndMergeHistory()` 实例同时运行**。
   它们同时读取了数据库的旧状态，又同时解析了当前的 DOM，并各自独立地向 IndexedDB 插入相同的新消息。因为每次解析 DOM 时 `extractHistoricalChatState` 都会为消息生成新的 ULID，数据库无法通过 ID 覆写它们，最终导致这些消息被**成批重复插入**，并在查询时按相近的时间戳被分组展示，就形成了你看到的 `HELP x7` 这样的结构。
2. **重叠检测算法缺陷 (Alignment Failure)**
   即使没有并发，原本 `state.js` 中的 `mergeAndDeduplicateMessages` 使用的是简单的“后缀-前缀匹配”。如果由于网络延迟或聊天框关闭导致数据库中**漏掉了一条中间消息**，新加载的 DOM 记录与数据库记录之间就会出现一个“空洞”。这会导致原算法找不到完美的重叠段，判断为重叠长度为 0，从而错误地触发 `[警告 - 此处可能存在记录丢失]`，并将 DOM 中的所有记录再次整体追加到数据库末尾，造成二次复制。

### 为什么去重逻辑会失效？

在 `analysis.js` 的去重逻辑中，有一个前置条件 `!record.is_historical`。这意味着去重工具被设计为**绝对不碰历史记录**。
然而，从 DOM 重新扫描加载上来的所有消息，都被标记为了 `is_historical: true`。因此，哪怕是因为上述 Bug 产生的疯狂重复的垃圾数据，只要它带有历史标记，去重扫描器就会直接忽略它，导致“扫描重复记录”对这种现象无能为力。

### 解决方案

基于以上分析，我们将实施以下修复：

1. **引入串行执行锁 (Mutex)**: 为 `scanAndMergeHistory()` 添加互斥锁与挂起重试机制。确保无论聊天框被开关多少次，历史扫描始终串行执行，杜绝并发写入导致的克隆现象。
2. **重构合并算法 (Robust Alignment Algorithm)**: 放弃脆弱的前后缀匹配，改用一种类似求最长公共子序列（LCS）的贪心对齐算法。它可以智能容忍数据空洞，自动提取真正缺失的消息，并利用你建议的时间戳挤压策略（`ensureIdMonotonicity`），将其安全地夹在正确的上下文之间。
3. **放开去重限制**: 移除 `analysis.js` 中 `!record.is_historical` 的限制。既然我们已经有 `爆发期 (burst)` 检测作为安全网（要求1秒内出现超过20条重复才删），那就完全可以让它清理历史数据中的因故障产生的重复项。

我将生成执行此修复的计划。

---

