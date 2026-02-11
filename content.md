我们为 `>>` 按钮添加了视觉状态反馈。现在，当该按钮激活“锁定到底部”模式时，它会呈现绿色背景，明确提示用户当前处于自动跟随最新消息的追踪状态。

## [WIP] feat: 为 ">>" 按钮添加吸附状态的视觉反馈

### 用户需求
1.  为 `>>` (最后一页) 按钮添加 `active` 类。
2.  当处于“吸附到底部”模式时，通过 CSS 将该按钮的背景颜色设置为绿色。

### 评论
视觉反馈是状态机的重要组成部分。此前用户只能通过观察滚动行为来推断是否处于锁定状态，现在通过按钮颜色的变化，用户可以直观地确认吸附模式是否生效，显著提升了交互的确定性。

### 目标
1.  在 `style.css` 中定义 `#page-last.active` 的样式。
2.  在 `renderer.js` 的渲染循环中，根据 `isLockedToBottom` 状态动态切换该按钮的 `active` 类。

### 基本原理
利用现有的 `renderer` 循环，根据 `uiState` 中的布尔值操作 DOM 元素的 `classList`。CSS 使用项目中预定义的 `--color-success` 变量以保持视觉一致性。

### 标签
#intent/refine #flow/ready #priority/low #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/pagination #task/action/optimization #task/state/end

---

### Script

#### Acts 1: 定义激活状态样式

在 `src/ui/style.css` 中添加针对最后一页按钮激活态的样式定义。

~~~~~act
patch_file
src/ui/style.css
~~~~~
~~~~~css.old
#log-archive-stats-button.active {
  background-color: var(--color-success);
}
#log-archive-settings-button.active {
  background-color: var(--color-warning);
  border-color: var(--color-warning-hover);
}
~~~~~
~~~~~css.new
#log-archive-stats-button.active {
  background-color: var(--color-success);
}
#page-last.active {
  background-color: var(--color-success);
}
#log-archive-settings-button.active {
  background-color: var(--color-warning);
  border-color: var(--color-warning-hover);
}
~~~~~

#### Acts 2: 动态应用 active 类

在 `src/ui/renderer.js` 中添加类名切换逻辑。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
      dom.pageInfoSpan.textContent = `${activePage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = isLast;
      // 最后一页按钮仅在“已处于吸附模式”且“已经在最后一页”时才禁用
      dom.pageLastBtn.disabled = isLast && isLockedToBottom;
    }
  };
~~~~~
~~~~~javascript.new
      dom.pageInfoSpan.textContent = `${activePage} / ${totalPages}`;
      const isFirst = currentPage === 1;
      const isLast = currentPage === totalPages;
      dom.pageFirstBtn.disabled = dom.pagePrevBtn.disabled = isFirst;
      dom.pageNextBtn.disabled = isLast;

      // 状态反馈：锁定模式下按钮变绿
      dom.pageLastBtn.classList.toggle('active', isLockedToBottom);

      // 最后一页按钮仅在“已处于吸附模式”且“已经在最后一页”时才禁用
      dom.pageLastBtn.disabled = isLast && isLockedToBottom;
    }
  };
~~~~~

### 下一步建议

至此，“自动跟随”与“分页吸附”功能已完整实现，且具备了良好的视觉反馈。
- **任务总结**: 我们完成了从“只读模式 UI 优化”到“多服务器跟随配置”，再到“吸附翻页逻辑”的一系列演进。
- **后续优化**: 考虑到聊天存档可能非常大，如果用户在“锁定底部”模式下切换频道，目前的逻辑也会保持锁定。可以观察这是否符合预期，或者在切换频道时强制解除锁定。
