这是一个非常合理的优化建议。将此类“魔法数字”统一抽取到常量中，不仅能保证用户体验的一致性，也极大地方便了未来根据用户反馈进行全局调整。

我将按照你的建议，在 `constants.js` 中定义 `UI_FEEDBACK_DURATION`，并在 UI 相关的逻辑模块中引用它。

## [WIP] refactor(ui): 统一 UI 反馈时长常量并应用

### 用户需求
目前 UI 中多个按钮反馈（如“已保存”、“已复制”、“导入成功”）使用的 `setTimeout` 回复时间不一致（1500ms 或 2000ms），需要统一定义为常量以增强维护性和交互一致性。

### 评论
这是一个典型的代码气味（Magic Numbers）重构。通过将交互延时中心化，我们遵循了 DRY (Don't Repeat Yourself) 原则，并为后续的 UI 调优提供了单一控制点。

### 目标
1.  在 `src/constants.js` 中新增 `UI_FEEDBACK_DURATION` 常量，默认值设为 `1500`。
2.  在 `src/ui/events.js` 中导入并应用该常量，替换现有的 `1500` 硬编码。
3.  在 `src/ui/index.js` 中导入并应用该常量，替换现有的 `2000` 硬编码。

### 基本原理
通过修改 `constants.js` 导出的配置，所有引用该常量的 UI 逻辑都将同步更新。我们选择 `1500ms` 作为标准值，因为这对于用户确认操作结果来说是一个体感舒适的视觉停留时间。

### 标签
#intent/refine #flow/ready #priority/low #comp/ui #comp/build #concept/ui #scope/dx #ai/instruct #task/domain/ui #task/object/constants #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 在 `constants.js` 中定义常量

我们将统一的反馈时长定义为 1500 毫秒。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
// 定义被视为主服务器的域名列表，以启用精细化解析
export const MAIN_SERVER_HOSTS = ['pony.town'];
~~~~~
~~~~~javascript.new
// 定义被视为主服务器的域名列表，以启用精细化解析
export const MAIN_SERVER_HOSTS = ['pony.town'];

// UI 交互反馈显示时长 (毫秒)
export const UI_FEEDBACK_DURATION = 1500;
~~~~~

#### Acts 2: 更新 `src/ui/events.js` 中的硬编码

我们需要为事件绑定模块添加导入，并替换现有的三处 `1500`。

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
/**
 * Binds all UI event listeners.
~~~~~
~~~~~javascript.new
import { UI_FEEDBACK_DURATION } from '../constants.js';

/**
 * Binds all UI event listeners.
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
    dom.saveNowButton.textContent = '✅ 已保存';
    setTimeout(() => {
      dom.saveNowButton.textContent = originalText;
    }, 1500);
~~~~~
~~~~~javascript.new
    dom.saveNowButton.textContent = '✅ 已保存';
    setTimeout(() => {
      dom.saveNowButton.textContent = originalText;
    }, UI_FEEDBACK_DURATION);
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
        dom.copyButton.textContent = '✅';
        setTimeout(() => {
          dom.copyButton.textContent = originalText;
        }, 1500);
~~~~~
~~~~~javascript.new
        dom.copyButton.textContent = '✅';
        setTimeout(() => {
          dom.copyButton.textContent = originalText;
        }, UI_FEEDBACK_DURATION);
~~~~~

~~~~~act
patch_file
src/ui/events.js
~~~~~
~~~~~javascript.old
    dom.copyAllButton.textContent = '已复制 JSON!';
    setTimeout(() => {
      dom.copyAllButton.textContent = originalText;
    }, 1500);
~~~~~
~~~~~javascript.new
    dom.copyAllButton.textContent = '已复制 JSON!';
    setTimeout(() => {
      dom.copyAllButton.textContent = originalText;
    }, UI_FEEDBACK_DURATION);
~~~~~

#### Acts 3: 更新 `src/ui/index.js` 中的硬编码

此文件中的反馈时长原为 `2000`，现在统一缩短为 `1500` (通过常量控制)。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
import { MigrationManager } from '../migrations.js';
import { storageManager } from '../storage/index.js';
~~~~~
~~~~~javascript.new
import { UI_FEEDBACK_DURATION } from '../constants.js';
import { MigrationManager } from '../migrations.js';
import { storageManager } from '../storage/index.js';
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
            dom.importButton.textContent = '✅ 导入成功';
            setTimeout(() => {
              dom.importButton.textContent = originalText;
            }, 2000);
~~~~~
~~~~~javascript.new
            dom.importButton.textContent = '✅ 导入成功';
            setTimeout(() => {
              dom.importButton.textContent = originalText;
            }, UI_FEEDBACK_DURATION);
~~~~~

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        renderer.render(appState, uiCallbacks); // Re-render to update button
      }, 2000);
~~~~~
~~~~~javascript.new
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        renderer.render(appState, uiCallbacks); // Re-render to update button
      }, UI_FEEDBACK_DURATION);
~~~~~

### 下一步建议
- **代码格式化**: 在应用这些更改后，建议运行 `npm run checkf` 以确保文件缩进和风格符合 Biome 的规范。
- **提交变更**: 如果你对统一后的 1500ms 反馈速度满意，我们可以生成一个 `[COMMIT]` 计划来持久化这些重构。
