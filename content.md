好的，既然有了功能覆盖更广的 UI 集成测试，我们可以对 `ui_state.test.js` 进行“瘦身”，使其专注于状态机本身的逻辑一致性（如边界条件计算、存储同步），而将“点击按钮后 UI 是否变化”这类验证交给集成测试。

## [WIP] test: 精简 UI 状态管理器单元测试

### 用户需求
随着 UI 集成测试的引入，原有的 `ui_state.test.js` 中部分测试用例与集成测试存在重叠。需要对其进行重构，保留核心的状态机逻辑验证，删除冗余的细碎测试。

### 评论
单元测试应专注于“逻辑计算”，集成测试应专注于“用户流程”。精简后的单元测试将更易于维护，且能更清晰地表达状态管理器的核心职责。

### 目标
1. 移除与集成测试功能重叠的简单视图切换测试。
2. 合并并保留核心逻辑测试：分页边界计算、配置持久化同步、服务器查看逻辑。

### 标签
#intent/refine #flow/ready #priority/low #comp/tests #task/domain/testing #task/object/ui-state-unit-test #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 重写 `tests/ui_state.test.js`

我们将该文件重构为更紧凑的形式，专注于内部逻辑。

~~~~~act
write_file
tests/ui_state.test.js
~~~~~
~~~~~javascript
import { beforeEach, describe, expect, it } from 'vitest';
import { createUIState } from '../src/ui/state.js';

describe('ui/state.js: UI State Manager Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('状态初始化：应正确合并存储中的配置与默认值', () => {
    localStorage.setItem('chatLogArchive_config', JSON.stringify({ pageSize: 50 }));
    const uiState = createUIState();
    const state = uiState.getState();
    
    expect(state.pageSize).toBe(50); // 来自存储
    expect(state.autoSaveInterval).toBe(30); // 默认值
    expect(state.viewMode).toBe('log'); // 默认初始视图
  });

  it('分页逻辑：应严格限制页码在有效范围内', () => {
    const uiState = createUIState();
    uiState.setTotalPages(10);

    uiState.setPage(5);
    expect(uiState.getState().currentPage).toBe(5);

    uiState.setPage(11); // 越上界
    expect(uiState.getState().currentPage).toBe(10);

    uiState.setPage(0); // 越下界
    expect(uiState.getState().currentPage).toBe(1);
  });

  it('持久化同步：修改配置应自动触发 localStorage 更新', () => {
    const uiState = createUIState();
    
    uiState.setPageSize(200);
    uiState.setAutoSaveInterval(60);

    const stored = JSON.parse(localStorage.getItem('chatLogArchive_config'));
    expect(stored.pageSize).toBe(200);
    expect(stored.autoSaveInterval).toBe(60);
  });

  it('多服务器逻辑：查看服务器默认应跟随活动服务器', () => {
    const uiState = createUIState();
    
    // 初始设置活动服务器
    uiState.setActiveServer('Server-A');
    expect(uiState.getState().viewingServer).toBe('Server-A');

    // 手动切换查看服务器后，不再随活动服务器改变
    uiState.setViewingServer('Server-B');
    uiState.setActiveServer('Server-C');
    expect(uiState.getState().viewingServer).toBe('Server-B');
    expect(uiState.getState().activeServer).toBe('Server-C');
  });
});
~~~~~

### 下一步建议
现在测试套件已经清理完毕且更加健壮。
1. **执行测试**：再次运行 `npm test` 确认所有测试（包括新的集成测试和精简后的单元测试）均通过。
2. **开启重构**：你可以正式开始“异步化重构”了。由于所有测试（除了 `migrations.test.js` 里的部分内容）现在都依赖于同一个模拟环境，这种结构将非常有利于你观察异步改动对全站的影响。
