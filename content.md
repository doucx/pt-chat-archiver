好的，我们继续进行代码清理和加固。这一步将重点解决 ID 生成的安全性和硬编码字符串带来的维护难题。

我们将 `generateULID` 升级为使用 Web Crypto API，这在浏览器环境下提供了密码学强度的随机性，有效防止在大规模数据导入或快速录制时可能出现的 ID 碰撞。同时，我们将建立一套初步的 UI 文字常量体系，为未来的国际化（i18n）打下基础。

## [WIP] refine: 升级随机 ID 生成器并统一 UI 常量

### 用户需求
1.  将 `utils.js` 中的 `generateULID` 升级为使用 `crypto.getRandomValues()` 以增强唯一性。
2.  将项目中散落的硬编码提示文字提取到 `constants.js` 中。

### 评论
使用 `Math.random()` 生成 ID 在涉及持久化存储的系统中是不可靠的，尤其是在处理成千上万条聊天记录时。升级到 `crypto` 模块是生产环境的标准做法。同时，消除硬编码字符串（Magic Strings）是提升代码可读性和可翻译性的关键重构步骤。

### 目标
1.  修改 `src/utils.js`，使用 `Uint8Array` 和 `crypto.getRandomValues` 重新实现 `generateULID` 的随机部分。
2.  在 `src/constants.js` 中新增 `UI_MESSAGES` 常量字典。
3.  重构 `src/state.js`、`src/analysis.js`、`src/ui/renderer.js` 和 `src/ui/index.js`，引用统一的常量。

### 基本原理
通过 Web Crypto API，我们可以获得真正的熵源，确保 ID 的随机部分在概率上几乎不可能重复。对于常量提取，我们采用集中管理模式，这使得修改提示语或支持多语言只需要修改一个文件，降低了代码耦合。

### 标签
#intent/refine #intent/tune #flow/ready #priority/medium 
#comp/engine #comp/ui #concept/ui #scope/core #scope/ux 
#ai/delegate
#task/domain/storage
#task/object/utils-and-constants
#task/action/refactor
#task/state/continue

---

### Script

#### Acts 1: 升级随机 ID 生成器

我们将修改 `utils.js`，移除不安全的 `Math.random()`。

~~~~~act
patch_file
src/utils.js
~~~~~
~~~~~javascript.old
  let randomChars = '';
  for (let i = 0; i < 16; i++) {
    randomChars += ENCODING.charAt(Math.floor(Math.random() * ENCODING_LEN));
  }
~~~~~
~~~~~javascript.new
  const randomValues = new Uint8Array(16);
  crypto.getRandomValues(randomValues);
  let randomChars = '';
  for (let i = 0; i < 16; i++) {
    // 256 是 32 (ENCODING_LEN) 的倍数，因此取模分布是均匀的
    randomChars += ENCODING.charAt(randomValues[i] % ENCODING_LEN);
  }
~~~~~

#### Acts 2: 在 constants.js 中定义 UI 常量

我们将创建一个 `UI_MESSAGES` 对象，收纳项目中主要的硬编码提示信息。

~~~~~act
patch_file
src/constants.js
~~~~~
~~~~~javascript.old
// UI 交互反馈显示时长 (毫秒)
export const UI_FEEDBACK_DURATION = 1500;
~~~~~
~~~~~javascript.new
// UI 交互反馈显示时长 (毫秒)
export const UI_FEEDBACK_DURATION = 1500;

// 统一 UI 提示文本
export const UI_MESSAGES = {
  // 状态与警告
  DISCONTINUITY_MARK: '[警告 - 此处可能存在记录丢失]',
  NO_RECORDS_IN_CHANNEL: '--- 在频道 [%s] 中没有记录 ---',
  NO_STATS_IN_CHANNEL: '--- 在频道 [%s] 中没有记录可供统计 ---',
  NO_USER_MSGS_FOR_STATS: '--- 在频道 [%s] 中没有可供精细统计的用户消息 ---',
  
  // 加载状态
  LOADING_PREPARE: '⏳ 正在准备读取数据...',
  LOADING_STATS: '⏳ 正在读取统计数据...',
  LOADING_HISTORY: '⏳ 正在读取历史记录...',
  LOADING_BUILDING: '⏳ 数据读取完毕，正在构建文本视图...',
  
  // 报告标题
  STATS_REPORT_HEADER: '--- [%s] 频道统计报告 (分析 %d 条消息) ---',
  TOP_TALKERS_TITLE: '\n\n===== 最活跃用户 (TOP 10) =====\n\n',
  HOURLY_ACTIVITY_TITLE: '\n\n===== 聊天峰值时间段 =====\n\n',
};
~~~~~

#### Acts 3: 应用常量到引擎状态管理

修改 `src/state.js` 以引用断层警告常量。

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
import { generateULID, getISOTimestamp } from './utils.js';

/**
 * 生成用于比较的消息签名。
~~~~~
~~~~~javascript.new
import { UI_MESSAGES } from './constants.js';
import { generateULID, getISOTimestamp } from './utils.js';

/**
 * 生成用于比较的消息签名。
~~~~~
~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
      sender: 'Archiver',
      receiver: 'System',
      content: '[警告 - 此处可能存在记录丢失]',
      is_archiver: true,
    };
~~~~~
~~~~~javascript.new
      sender: 'Archiver',
      receiver: 'System',
      content: UI_MESSAGES.DISCONTINUITY_MARK,
      is_archiver: true,
    };
~~~~~

#### Acts 4: 应用常量到统计分析模块

重构 `src/analysis.js` 中的报告模板。

~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript.old
import { formatISOTimeForDisplay, getISOTimestamp } from './utils.js';

/**
 * 计算活跃用户分布。
~~~~~
~~~~~javascript.new
import { UI_MESSAGES } from './constants.js';
import { formatISOTimeForDisplay, getISOTimestamp } from './utils.js';

/**
 * 计算活跃用户分布。
~~~~~
~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript.old
function formatTopTalkers(results) {
  const { data, total } = results;
  const text = '\n\n===== 最活跃用户 (TOP 10) =====\n\n';
  if (data.length === 0 || total === 0) return `${text}无用户发言记录。`;
~~~~~
~~~~~javascript.new
function formatTopTalkers(results) {
  const { data, total } = results;
  const text = UI_MESSAGES.TOP_TALKERS_TITLE;
  if (data.length === 0 || total === 0) return `${text}无用户发言记录。`;
~~~~~
~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript.old
function formatHourlyActivity(results) {
  const { data, total } = results;
  const text = '\n\n===== 聊天峰值时间段 =====\n\n';
  if (data.length === 0 || total === 0) return `${text}无有效时间记录。`;
~~~~~
~~~~~javascript.new
function formatHourlyActivity(results) {
  const { data, total } = results;
  const text = UI_MESSAGES.HOURLY_ACTIVITY_TITLE;
  if (data.length === 0 || total === 0) return `${text}无有效时间记录。`;
~~~~~
~~~~~act
patch_file
src/analysis.js
~~~~~
~~~~~javascript.old
export function generateStatisticsText(messages, channelName) {
  if (!messages || messages.length === 0)
    return `--- 在频道 [${channelName}] 中没有记录可供统计 ---`;
  const filteredMessages = messages.filter((msg) => !msg.is_fallback && !msg.is_archiver);
  if (filteredMessages.length === 0)
    return `--- 在频道 [${channelName}] 中没有可供精细统计的用户消息 ---`;
  let output = `--- [${channelName}] 频道统计报告 (分析 ${filteredMessages.length} 条消息) ---\n`;
  output += formatTopTalkers(calculateTopTalkers(filteredMessages));
  output += formatHourlyActivity(calculateHourlyActivity(filteredMessages));
  return output;
}
~~~~~
~~~~~javascript.new
export function generateStatisticsText(messages, channelName) {
  if (!messages || messages.length === 0)
    return UI_MESSAGES.NO_STATS_IN_CHANNEL.replace('%s', channelName);
  const filteredMessages = messages.filter((msg) => !msg.is_fallback && !msg.is_archiver);
  if (filteredMessages.length === 0)
    return UI_MESSAGES.NO_USER_MSGS_FOR_STATS.replace('%s', channelName);

  let output = UI_MESSAGES.STATS_REPORT_HEADER
    .replace('%s', channelName)
    .replace('%d', filteredMessages.length) + '\n';
    
  output += formatTopTalkers(calculateTopTalkers(filteredMessages));
  output += formatHourlyActivity(calculateHourlyActivity(filteredMessages));
  return output;
}
~~~~~

#### Acts 5: 应用常量到 UI 渲染模块

重构 `src/ui/renderer.js` 和 `src/ui/index.js` 中的占位符和加载状态文本。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
import { generateStatisticsText } from '../analysis.js';
import { MigrationManager } from '../migrations.js';
~~~~~
~~~~~javascript.new
import { UI_MESSAGES } from '../constants.js';
import { generateStatisticsText } from '../analysis.js';
import { MigrationManager } from '../migrations.js';
~~~~~
~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value =
          messages.length > 0
            ? messages.map(formatMessageForDisplay).join('\n')
            : `--- 在频道 [${selectedChannel}] 中没有记录 ---`;
      });
~~~~~
~~~~~javascript.new
      updateTextareaAndPreserveSelection(() => {
        dom.logDisplay.value =
          messages.length > 0
            ? messages.map(formatMessageForDisplay).join('\n')
            : UI_MESSAGES.NO_RECORDS_IN_CHANNEL.replace('%s', selectedChannel);
      });
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
import { UI_FEEDBACK_DURATION } from '../constants.js';
import { MigrationManager } from '../migrations.js';
~~~~~
~~~~~javascript.new
import { UI_FEEDBACK_DURATION, UI_MESSAGES } from '../constants.js';
import { MigrationManager } from '../migrations.js';
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
      if (viewMode === 'stats') {
        const { statsLimit } = uiState.getState();
        fetchSize = statsLimit;
        offset = Math.max(0, totalCount - statsLimit);
        fetchPage = 1;

        // stats 模式特殊，绕过分页缓存，全量拉取
        dom.logDisplay.value = '⏳ 正在准备读取数据...';
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (renderId !== currentRenderId) return;

        const result = await dataAdapter.getMessages(
          currentServer,
          selectedChannel,
          fetchPage,
          fetchSize,
          (current, total) => {
            if (renderId !== currentRenderId) return;
            const width = 20;
            const percentage = current / total;
            const filled = Math.round(width * percentage);
            const empty = width - filled;
            const bar = `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
            dom.logDisplay.value = `⏳ 正在读取统计数据...\n\n    ${bar} ${Math.round(
              percentage * 100,
            )}%\n    已读取: ${current} / ${total} 条`;
          },
          offset,
        );
~~~~~
~~~~~javascript.new
      if (viewMode === 'stats') {
        const { statsLimit } = uiState.getState();
        fetchSize = statsLimit;
        offset = Math.max(0, totalCount - statsLimit);
        fetchPage = 1;

        // stats 模式特殊，绕过分页缓存，全量拉取
        dom.logDisplay.value = UI_MESSAGES.LOADING_PREPARE;
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (renderId !== currentRenderId) return;

        const result = await dataAdapter.getMessages(
          currentServer,
          selectedChannel,
          fetchPage,
          fetchSize,
          (current, total) => {
            if (renderId !== currentRenderId) return;
            const width = 20;
            const percentage = current / total;
            const filled = Math.round(width * percentage);
            const empty = width - filled;
            const bar = `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
            dom.logDisplay.value = `${UI_MESSAGES.LOADING_STATS}\n\n    ${bar} ${Math.round(
              percentage * 100,
            )}%\n    已读取: ${current} / ${total} 条`;
          },
          offset,
        );
~~~~~
~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
        if (viewCache.has(fetchPage)) {
          messages = viewCache.get(fetchPage); // 零延迟命中！
        } else {
          // 缓存未命中，执行完整 DB 提取生命周期
          dom.logDisplay.value = '⏳ 正在准备读取数据...';
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (renderId !== currentRenderId) return;

          const result = await dataAdapter.getMessages(
            currentServer,
            selectedChannel,
            fetchPage,
            fetchSize,
            (current, total) => {
              if (renderId !== currentRenderId) return;
              const width = 20;
              const percentage = current / total;
              const filled = Math.round(width * percentage);
              const empty = width - filled;
              const bar = `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
              dom.logDisplay.value = `⏳ 正在读取历史记录...\n\n    ${bar} ${Math.round(percentage * 100)}%\n    已读取: ${current} / ${total} 条`;
            },
          );

          if (renderId !== currentRenderId) return;

          messages = result.messages;
          totalCount = result.total; // 确保一致性

          viewCache.setTotalCount(totalCount);
          viewCache.set(fetchPage, messages); // 存入缓存

          // 过渡状态
          dom.logDisplay.value = '⏳ 数据读取完毕，正在构建文本视图...';
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
~~~~~
~~~~~javascript.new
        if (viewCache.has(fetchPage)) {
          messages = viewCache.get(fetchPage); // 零延迟命中！
        } else {
          // 缓存未命中，执行完整 DB 提取生命周期
          dom.logDisplay.value = UI_MESSAGES.LOADING_PREPARE;
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (renderId !== currentRenderId) return;

          const result = await dataAdapter.getMessages(
            currentServer,
            selectedChannel,
            fetchPage,
            fetchSize,
            (current, total) => {
              if (renderId !== currentRenderId) return;
              const width = 20;
              const percentage = current / total;
              const filled = Math.round(width * percentage);
              const empty = width - filled;
              const bar = `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
              dom.logDisplay.value = `${UI_MESSAGES.LOADING_HISTORY}\n\n    ${bar} ${Math.round(percentage * 100)}%\n    已读取: ${current} / ${total} 条`;
            },
          );

          if (renderId !== currentRenderId) return;

          messages = result.messages;
          totalCount = result.total; // 确保一致性

          viewCache.setTotalCount(totalCount);
          viewCache.set(fetchPage, messages); // 存入缓存

          // 过渡状态
          dom.logDisplay.value = UI_MESSAGES.LOADING_BUILDING;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
~~~~~

### 下一步建议

我们已经成功升级了底层的安全设施并完成了初步的文字常量提取。这使得代码不仅更安全，也更容易进行视觉风格的微调。

接下来的建议步骤是执行 **优先级 2** 中的存储层重构：
*   **Promise 化 IDB 事务**：在 `src/storage/indexed-db-adapter.js` 中提取一个通用的 `executeRequest` 辅助函数，消除重复的 `onsuccess/onerror` 样板代码，并补齐该文件的测试用例，将覆盖率从 18% 提升上去。

如果你同意，我们将开始清理 `indexed-db-adapter.js`。
