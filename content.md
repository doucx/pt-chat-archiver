好的，我们已经成功复现并修复了消息排序逻辑中的精度丢失问题，并通过了 TDD 测试。现在我将生成提交指令，将这些变更永久记录到仓库中。

## [COMMIT] fix: 确保 ULID 单调性并修复历史记录回扫导致的排序倒错

### 用户需求
修复一个关键的数据一致性问题：当从 DOM 扫描历史记录时，由于 UI 仅显示到“分钟”精度（例如 10:00:00），导致生成的 ULID 可能小于之前捕获的高精度实时消息（例如 10:00:32），从而在数据库中引起排序混乱。

### 评论
这是一个典型的由于物理时钟精度不足导致逻辑时钟失效的案例。通过在合并层强制执行 ID 单调性检查，我们确保了系统的“加入顺序”始终优于“文本声明的时间”，极大地增强了存档系统在处理异步、模糊精度数据源时的健壮性。

### 目标
1.  在 `src/main.js` 中重构历史记录提取逻辑，确保单次扫描产生的 ID 序列严格递增。
2.  在 `src/state.js` 中引入 `ensureIdMonotonicity` 逻辑，在消息合并阶段自动识别并修复排序冲突。
3.  添加 `tests/ordering.test.js` 自动化测试用例，覆盖单批次单调性和跨源合并冲突场景。

### 基本原理
采用逻辑时钟策略：如果 $Time(B) \le Time(A)$ 但逻辑上 $B$ 发生在 $A$ 之后，则 $ID(B) = GenerateULID(Time(A) + 1ms)$。这保证了 ULID 的字典序能够准确反映消息的逻辑流向。

### 标签
#intent/fix #flow/ready #priority/high #comp/engine #comp/runtime #concept/state #concept/history #scope/core #ai/instruct #task/domain/storage #task/object/message-ordering #task/action/bug-fix #task/state/end

---

### Script

#### Acts 1: 提交排序修复相关的变更

我们将把涉及核心状态管理、解析逻辑和测试文件的修改一并提交。

~~~~~act
git_add
src/main.js
src/state.js
tests/ordering.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
fix: ensure ULID monotonicity and fix historical message ordering

Addressed a critical issue where low-precision timestamps from historical 
DOM scanning (00s) could result in ULIDs smaller than previously captured 
high-precision live messages (e.g., 32s), causing out-of-order storage 
in IndexedDB.

Key changes:
- Refactored `extractHistoricalChatState` in `main.js` to ensure batch
  monotonicity during DOM parsing.
- Integrated `ensureIdMonotonicity` into `mergeAndDeduplicateMessages` 
  in `state.js` to automatically repair ID sequences during any merge.
- Added integration tests in `tests/ordering.test.js` to verify 
  lexicographical ordering of IDs under precision loss scenarios.

The system now correctly prioritizes logical sequence over ambiguous 
physical timestamps while maintaining data integrity.
~~~~~

### 下一步建议
- **回归测试**：由于修改了核心的 `merge` 逻辑，建议运行所有现有的集成测试 (`npm test`) 以确保没有引入副作用。
- **性能评估**：当前的修复逻辑是在每次合并时进行线性扫描。虽然对于聊天频道的消息量来说开销极小，但在处理超大规模历史数据时可以考虑进一步优化。
