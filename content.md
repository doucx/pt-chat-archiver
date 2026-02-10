这是一个非常棒的 UX 细节改进。

通过在下拉菜单中明确标识出“正在记录”的服务器，用户可以更直观地分辨出哪个服务器是当前活跃的实时数据源，哪个是纯粹的历史存档。这能有效降低在多服务器环境下操作时的认知负担。

我将生成一个计划来应用这个视觉增强。

## [WIP] tune(ui): highlight currently recording server in view selector

### 用户需求
在设置界面的“查看存档服务器”下拉菜单中，如果某个选项是当前正在录制数据的服务器，则在其名称后面增加“（正在记录）”的后缀。

### 评论
这个微调极大提升了多服务器管理功能的可发现性和易用性。它能够通过简单的文字提示，向用户传达复杂的后台状态，符合“所见即所得”的设计原则。

### 目标
1. 修改 `src/ui/renderer.js` 中的服务器选择器渲染逻辑。
2. 根据 `activeServer` 状态动态调整选项的 `textContent`。

### 基本原理
在 `renderer.js` 的 `render` 函数中，我们已经拥有了 `activeServer`（物理检测到的服务器）和 `servers`（存档中的服务器列表）。在遍历列表生成 `<option>` 元素时，我们只需加入一个简单的条件判断：如果当前遍历的服务器 ID 等于 `activeServer`，则在显示文本中追加标注。

### 标签
#intent/tune #flow/ready #priority/low #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/server-selector #task/action/refine #task/state/begin

---

### Script

#### Acts 1: 增强服务器选择器的显示逻辑

修改 `src/ui/renderer.js` 中负责填充 `serverViewSelector` 的循环。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
      } else {
        for (const s of servers) {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          dom.serverViewSelector.appendChild(opt);
        }
        dom.serverViewSelector.value = viewingServer || prevServer || servers[0] || '';
      }
~~~~~
~~~~~javascript.new
      } else {
        for (const s of servers) {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s === activeServer ? `${s} (正在记录)` : s;
          dom.serverViewSelector.appendChild(opt);
        }
        dom.serverViewSelector.value = viewingServer || prevServer || servers[0] || '';
      }
~~~~~

### 下一步建议
- **测试录制中状态**: 进入游戏后打开设置，确认当前服务器是否带有了“（正在记录）”的后缀。
- **测试离线状态**: 刷新页面并在主界面（未进入游戏，`activeServer` 为空）时打开设置，确认所有服务器名称都恢复为普通显示。
- **CSS 优化**: 如果需要更明显的视觉区分，可以考虑为“正在记录”的选项增加不同的文字颜色（通过为 `option` 添加 class 或 inline style，虽然部分浏览器对 `option` 的样式支持有限）。
