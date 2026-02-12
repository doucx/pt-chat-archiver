好的，我们已经成功实现了迁移逻辑的解耦与容错性增强。现在通过 Git 将这些变更作为一个完整的逻辑单元进行提交。

## [COMMIT] fix(storage): improve migration resilience against LocalStorage limits

### 用户需求
确保即使用户的 LocalStorage 已经达到 5MB 上限，系统依然能够顺利完成从旧版本（V4/V5/V6）到 IndexedDB（V7）的迁移，而不被备份失败或中间写入失败所阻断。

### 评论
这是一个至关重要的健壮性改进。对于长期用户来说，存档接近 5MB 是非常普遍的情况，如果在这种关键时刻迁移失败，会导致数据丢失或陷入无法启动的循环。通过引入“内存直通管道”和“优雅降级备份”，我们确保了数据的安全迁移。

### 目标
1.  提交 `src/migrations.js` 的重构，支持 source/target 分离。
2.  提交新增的管道测试和更新后的旧测试。

### 基本原理
1.  **V6 -> V7**: 备份步骤被设为“非阻塞”，如果空间不足则跳过备份，直接进行 IDB 写入和 LS 清理。
2.  **V5 -> V7**: 实现了内存管道，数据直接从 LS 读取并泵入 IDB，完全绕过了 LS 的中间写入。
3.  **多适配器兼容**: 解决了 IDB 适配器无法“看见” LS 中旧数据的问题。

### 标签
#intent/fix #flow/ready #priority/high #comp/runtime #concept/state #scope/core #ai/instruct #task/domain/storage #task/object/migration-resilience #task/action/commit #task/state/end #task/status/completed

---

### Script

#### Acts 1: 提交变更

我们将相关的源文件和测试文件添加到暂存区并创建提交。

~~~~~act
git_add
src/migrations.js
tests/migrations.test.js
tests/migrations_pipeline.test.js
~~~~~

~~~~~act
git_commit
~~~~~
~~~~~text
fix(storage): improve migration resilience against LocalStorage limits

Implemented an "In-Memory Migration Pipeline" and "Graceful Degradation" for data migrations to solve the 5MB QuotaExceededError issue:

1. Refactored `migrateV5toV6` to support separate source (LS) and target (IDB) adapters. This allows V5 data to be read from LS and written directly to IDB as V7, skipping the problematic V6-write-to-LS step.
2. Enhanced `migrateV6ToV7` by wrapping the backup step in a try-catch. If creating a backup in LS fails due to capacity limits, the system now warns the user but proceeds with IDB writing and LS cleanup.
3. Updated `checkAndTriggerInteractiveMigrations` to explicitly use `LocalStorageAdapter` for legacy data discovery, ensuring older archives are found even when the main adapter is IndexedDB.
4. Added a comprehensive pipeline test suite to verify migration success even when `localStorage.setItem` throws.
~~~~~

### 下一步建议
- **回归测试**: 建议在实际的 PonyTown 环境中，通过控制台 `localStorage.setItem` 填充大量垃圾数据直到报错，然后刷新页面触发真实迁移，验证 UI 提示和结果。
- **文档更新**: 可以在 README 或项目文档中注明，现在的系统已完全解决 5MB 限制问题，鼓励用户迁移到新版。
