这是因为 `style.css` 中统计按钮的默认背景色被硬编码为了绿色（`#3a8c54`），这导致即便没有 `.active` 类，它看起来也像是“被激活”的。

我将修改 `style.css`，让统计按钮在默认状态下保持与其他按钮一致的深灰色，仅在切换到统计视图（`.active`）时才变绿高亮。

## [WIP] fix: 修正统计按钮在非激活状态下的高亮显示问题

### 错误分析
在 `style.css` 中，`#log-archive-stats-button` 的基础样式被设置为了绿色。由于 `.active` 类设置的也是同样的绿色背景，导致按钮在“统计”和“记录”文本切换时，视觉上的颜色反馈没有发生变化，始终处于高亮状态。

### 用户需求
当页面显示“记录”时，统计按钮应显示为普通按钮颜色（灰色）；仅当用户点击并切换到“统计”视图时，按钮才变绿。

### 目标
1.  调整 `src/style.css`，将统计按钮的默认背景色改为标准按钮色（`#4a545e`）。
2.  确保 `.active` 类能正确提供绿色高亮反馈。

### 标签
#intent/fix #flow/ready #priority/medium #comp/ui #scope/ux #ai/delegate #task/domain/ui #task/object/stats-button-style #task/action/fix #task/state/continue

---

### Script

#### Acts 1: 修正统计按钮的 CSS 颜色定义

我们将统计按钮的基础背景色改为标准灰色，并保持 `.active` 状态为绿色。

~~~~~act
patch_file
src/style.css
~~~~~
~~~~~css.old
#log-archive-stats-button {
  background-color: #3a8c54;
}
#log-archive-stats-button:hover {
  background-color: #7b65a0;
}
#log-archive-stats-button.active {
  background-color: #3a8c54;
  border-color: #4da669;
  color: #fff;
}
~~~~~
~~~~~css.new
#log-archive-stats-button {
  background-color: #4a545e;
}
#log-archive-stats-button:hover {
  background-color: #6c7886;
}
#log-archive-stats-button.active {
  background-color: #3a8c54;
  border-color: #4da669;
  color: #fff;
}
~~~~~

### 下一步建议
1.  **刷新页面测试**:
    *   默认状态：按钮显示“📊 统计”，颜色为灰色。
    *   点击后：按钮显示“📜 记录”，颜色变为绿色。
2.  **提交代码**: 视觉反馈确认正常后即可提交。
