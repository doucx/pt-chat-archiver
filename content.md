[简要回答]

## [WIP] fix(migrations): 增强迁移逻辑对 LS 空间不足的容错性

### 用户需求
在数据迁移（V6 LocalStorage -> V7 IndexedDB）过程中，如果因为 LocalStorage 空间已满导致“创建备份副本”这一步失败，系统不应抛出异常中止迁移。相反，系统应捕获该错误，跳过备份步骤，并继续清理旧数据，以确保数据成功进入 IndexedDB 并避免重复迁移。

### 评论
这是一个关键的健壮性改进。在浏览器存储受限的环境下，优先保全“活数据”（迁移到更大容量的 IDB）远比保全“死备份”（留在 LS 中）重要。如果因为做不了备份而导致连正库都建不起来，那是本末倒置。

### 目标
1.  修改 `src/migrations.js` 中的 `migrateV6ToV7` 方法。
2.  将 `localStorage.setItem(..., _backup)` 操作包裹在独立的 `try-catch` 块中。
3.  确保即使备份失败，`localStorage.removeItem` 依然执行，防止下次启动重复触发迁移。

### 基本原理
我们采用“尽力而为（Best-Effort）”的策略处理备份。
1.  **核心路径**（读取 LS -> 写入 IDB）必须成功。如果这步失败，整个迁移应当中止（保持现有逻辑）。
2.  **辅助路径**（备份 LS 数据）是可选的。如果因 `QuotaExceededError` 失败，我们记录警告但视为迁移成功。
3.  **清理路径**（移除 LS 源数据）必须在核心路径成功后执行，无论辅助路径是否成功。这能释放紧缺的 LS 空间，并标记迁移完成。

### 标签
#intent/refine #flow/ready #priority/high #comp/runtime #concept/state #scope/core #ai/instruct #task/domain/storage #task/object/migration-resilience #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 增强 `migrateV6ToV7` 的容错性

我们将重构 `migrateV6ToV7` 方法，将备份逻辑隔离。

~~~~~act
patch_file
src/migrations.js
~~~~~
~~~~~javascript.old
      // 3. 验证与清理 (暂不删除，改为重命名备份，以防万一)
      const raw = localStorage.getItem(STORAGE_KEY_V6);
      localStorage.setItem(`${STORAGE_KEY_V6}_backup`, raw);
      localStorage.removeItem(STORAGE_KEY_V6);

      console.info('[Migration] V6 -> V7 迁移成功！旧数据已备份为 _backup');
    } catch (e) {
      console.error('[Migration] V6 -> V7 迁移失败，已中止操作:', e);
      throw e; // 抛出异常阻断启动，防止数据不一致
    }
  },
~~~~~
~~~~~javascript.new
      // 3. 验证与清理
      // 尝试备份旧数据，如果空间不足则跳过备份，优先保证迁移完成
      try {
        const raw = localStorage.getItem(STORAGE_KEY_V6);
        localStorage.setItem(`${STORAGE_KEY_V6}_backup`, raw);
        console.info('[Migration] V6 -> V7 迁移成功！旧数据已备份为 _backup');
      } catch (backupError) {
        console.warn(
          '[Migration] 备份旧数据失败 (可能是空间不足)，将跳过备份步骤直接清理旧数据以释放空间。',
          backupError,
        );
      }

      // 无论备份是否成功，只要新数据已安全写入 IDB，就移除旧 key
      // 这既防止了下次启动重复迁移，也能立即释放 LocalStorage 空间
      localStorage.removeItem(STORAGE_KEY_V6);
    } catch (e) {
      console.error('[Migration] V6 -> V7 迁移失败，已中止操作:', e);
      throw e; // 抛出异常阻断启动，防止数据不一致
    }
  },
~~~~~

### 下一步建议

1.  **验证测试**: 再次运行 `npm test tests/migrations.test.js`。现在所有测试（包括我们之前添加的 `QuotaExceededError` 场景）都应该通过。
2.  **检查其他路径**: 审查 V5->V6 的迁移逻辑（`migrateV5toV6`）。目前它是直接 `removeV5Data` 而没有尝试备份，这在逻辑上是安全的（不增加空间消耗），因此无需修改。
