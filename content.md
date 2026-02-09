选择了使用 `src/analysis.js` 作为新模块。这将使 `ui.js` 彻底摆脱沉重的数据计算任务，同时也让 `state.js` 能够回归到纯粹的“数据持久化与合并”职责。

## [WIP] refactor: 提取统计与分析逻辑至独立模块

### 用户需求
将分散在 `ui.js` 和 `state.js` 中的数据分析、统计计算以及重复项检测逻辑提取到独立的 `src/analysis.js` 模块中。

### 评论
目前的架构中，`ui.js` 承担了太多的非 UI 职责，尤其是复杂的统计字符串格式化逻辑。而 `state.js` 中的重复项检测逻辑本质上也是一种数据分析。通过将这些“只读”或“数据转换”类的函数移至 `analysis.js`，我们可以实现更好的关注点分离（SoC），并为接下来的分页重构扫清障碍。

### 目标
1.  **新建 `src/analysis.js`**: 容纳统计、格式化和清理逻辑。
2.  **重构 `src/ui.js`**: 移除内部统计函数，改为从 `analysis.js` 导入。
3.  **重构 `src/state.js`**: 移出分析相关的 `detectTotalDuplicates` 和 `cleanChannelRecords`。
4.  **修复 `src/main.js`**: 更新由于函数移动导致的导入路径变化。

### 基本原理
- **分析 (Analysis)**: 输入数据，输出洞察（或清理后的副本），不改变原始状态。
- **状态 (State)**: 负责 IO（localStorage）和结构化合并。
- **UI**: 负责 DOM 调度和事件响应。
将分析逻辑独立出来后，我们可以更方便地在不影响 UI 的情况下优化计算性能。

### 标签
#intent/refine #flow/ready #priority/medium 
#comp/ui #comp/engine #concept/state #scope/dx 
#ai/instruct 
#task/domain/ui #task/object/ui-refactor-pagination #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 创建 `src/analysis.js` 模块

我们将把所有与数据“分析”相关的函数集中到这里。

~~~~~act
write_file
src/analysis.js
~~~~~
~~~~~javascript
import { formatISOTimeForDisplay, getISOTimestamp } from './utils.js';

/**
 * 计算活跃用户分布。
 */
export function calculateTopTalkers(messages) {
  const counts = new Map();
  let totalMessagesInPeriod = 0;
  for (const msg of messages) {
    if (msg.sender && msg.sender !== 'System') {
      counts.set(msg.sender, (counts.get(msg.sender) || 0) + 1);
      totalMessagesInPeriod++;
    }
  }
  const data = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return { data, total: totalMessagesInPeriod };
}

/**
 * 计算小时活跃度。
 */
export function calculateHourlyActivity(messages) {
  const hourlyCounts = new Array(24).fill(0);
  let totalMessagesInPeriod = 0;
  for (const msg of messages) {
    try {
      const hour = new Date(msg.time).getHours();
      hourlyCounts[hour]++;
      totalMessagesInPeriod++;
    } catch (e) {
      /* ignore */
    }
  }
  const data = hourlyCounts
    .map((count, hour) => ({ hour, count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  return { data, total: totalMessagesInPeriod };
}

function formatTopTalkers(results) {
  const { data, total } = results;
  const text = '\n\n===== 最活跃用户 (TOP 10) =====\n\n';
  if (data.length === 0 || total === 0) return `${text}无用户发言记录。`;
  return (
    text +
    data
      .slice(0, 10)
      .map((item) => {
        const percentage = ((item.count / total) * 100).toFixed(1);
        return `${item.name.padEnd(20, ' ')} | ${item.count} 条消息 (${percentage}%)`;
      })
      .join('\n')
  );
}

function formatHourlyActivity(results) {
  const { data, total } = results;
  const text = '\n\n===== 聊天峰值时间段 =====\n\n';
  if (data.length === 0 || total === 0) return `${text}无有效时间记录。`;
  return (
    text +
    data
      .map((item) => {
        const hourStr = String(item.hour).padStart(2, '0');
        const nextHourStr = String((item.hour + 1) % 24).padStart(2, '0');
        const percentage = ((item.count / total) * 100).toFixed(1);
        return `${`${hourStr}:00 - ${nextHourStr}:00 `.padEnd(
          16,
          ' ',
        )}| ${item.count} 条消息 (${percentage}%)`;
      })
      .join('\n')
  );
}

/**
 * 生成频道统计报告。
 */
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

/**
 * 识别消息爆发期和重复项。
 * 内部工具函数，供清理和检测使用。
 */
function identifyBurstDuplicates(records) {
  if (!records || records.length === 0) return { is_in_burst: [], seen_contents: new Set() };
  const BURST_COUNT_THRESHOLD = 20;
  const BURST_TIME_THRESHOLD_MS = 1000;
  const is_in_burst = new Array(records.length).fill(false);
  if (records.length >= BURST_COUNT_THRESHOLD) {
    for (let i = 0; i <= records.length - BURST_COUNT_THRESHOLD; i++) {
      try {
        const startTime = new Date(records[i].time).getTime();
        const endTime = new Date(records[i + BURST_COUNT_THRESHOLD - 1].time).getTime();
        if (Number.isNaN(startTime) || Number.isNaN(endTime)) continue;
        if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
          for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
            is_in_burst[j] = true;
          }
        }
      } catch (e) {}
    }
  }
  return is_in_burst;
}

/**
 * 清理一个频道记录中的重复数据。
 */
export function cleanChannelRecords(records) {
  if (!records || records.length === 0) return { cleanedRecords: [], removedCount: 0 };
  const is_in_burst = identifyBurstDuplicates(records);
  const cleanedRecords = [];
  const seen_contents = new Set();
  let removedCount = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const content = record.content;
    const is_duplicate = content != null && seen_contents.has(content);
    const should_delete = !record.is_historical && is_duplicate && is_in_burst[i];
    if (!should_delete) {
      cleanedRecords.push(record);
    } else {
      removedCount++;
    }
    if (content != null) seen_contents.add(content);
  }
  return { cleanedRecords, removedCount };
}

/**
 * 检测所有频道中可被清理的重复记录总数。
 */
export function detectTotalDuplicates(messagesByChannel) {
  let totalDuplicates = 0;
  if (!messagesByChannel) return 0;
  for (const channel in messagesByChannel) {
    const records = messagesByChannel[channel];
    if (!records || records.length === 0) continue;
    const is_in_burst = identifyBurstDuplicates(records);
    const seen_contents = new Set();
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const content = record.content;
      if (!record.is_historical && content != null && seen_contents.has(content) && is_in_burst[i]) {
        totalDuplicates++;
      }
      if (content != null) seen_contents.add(content);
    }
  }
  return totalDuplicates;
}
~~~~~

#### Acts 2: 清理 `src/ui.js`

移除不再需要的内部计算逻辑，并引用 `src/analysis.js`。

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
import { SELF_NAME_KEY, STORAGE_KEY_V5 } from './constants.js';
import { getMainContainerHTML, TOGGLE_BUTTON_ICON } from './templates.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from './utils.js';
~~~~~
~~~~~javascript.new
import { generateStatisticsText } from './analysis.js';
import { SELF_NAME_KEY, STORAGE_KEY_V5 } from './constants.js';
import { getMainContainerHTML, TOGGLE_BUTTON_ICON } from './templates.js';
import { formatISOTimeForDisplay, getStorageUsageInMB } from './utils.js';
~~~~~

~~~~~act
patch_file
src/ui.js
~~~~~
~~~~~javascript.old
  function updateTextareaAndPreserveSelection(updateFn) {
    const isFocused = document.activeElement === logDisplay;
    let selectionStart;
    let selectionEnd;
    if (isFocused) {
      selectionStart = logDisplay.selectionStart;
      selectionEnd = logDisplay.selectionEnd;
    }
    updateFn();
    if (isFocused) {
      logDisplay.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  // --- Data Statistics & Formatting ---
  function calculateTopTalkers(messages) {
    const counts = new Map();
    let totalMessagesInPeriod = 0;
    for (const msg of messages) {
      if (msg.sender && msg.sender !== 'System') {
        counts.set(msg.sender, (counts.get(msg.sender) || 0) + 1);
        totalMessagesInPeriod++;
      }
    }
    const data = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return { data, total: totalMessagesInPeriod };
  }

  function calculateHourlyActivity(messages) {
    const hourlyCounts = new Array(24).fill(0);
    let totalMessagesInPeriod = 0;
    for (const msg of messages) {
      try {
        const hour = new Date(msg.time).getHours();
        hourlyCounts[hour]++;
        totalMessagesInPeriod++;
      } catch (e) {
        /* ignore */
      }
    }
    const data = hourlyCounts
      .map((count, hour) => ({ hour, count }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
    return { data, total: totalMessagesInPeriod };
  }

  function formatTopTalkers(results) {
    const { data, total } = results;
    const text = '\n\n===== 最活跃用户 (TOP 10) =====\n\n';
    if (data.length === 0 || total === 0) return `${text}无用户发言记录。`;
    return (
      text +
      data
        .slice(0, 10)
        .map((item) => {
          const percentage = ((item.count / total) * 100).toFixed(1);
          return `${item.name.padEnd(20, ' ')} | ${item.count} 条消息 (${percentage}%)`;
        })
        .join('\n')
    );
  }

  function formatHourlyActivity(results) {
    const { data, total } = results;
    const text = '\n\n===== 聊天峰值时间段 =====\n\n';
    if (data.length === 0 || total === 0) return `${text}无有效时间记录。`;
    return (
      text +
      data
        .map((item) => {
          const hourStr = String(item.hour).padStart(2, '0');
          const nextHourStr = String((item.hour + 1) % 24).padStart(2, '0');
          const percentage = ((item.count / total) * 100).toFixed(1);
          return `${`${hourStr}:00 - ${nextHourStr}:00 `.padEnd(
            16,
            ' ',
          )}| ${item.count} 条消息 (${percentage}%)`;
        })
        .join('\n')
    );
  }

  function generateStatisticsText(messages, channelName) {
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

  function formatMessageForDisplay(msg) {
~~~~~
~~~~~javascript.new
  function updateTextareaAndPreserveSelection(updateFn) {
    const isFocused = document.activeElement === logDisplay;
    let selectionStart;
    let selectionEnd;
    if (isFocused) {
      selectionStart = logDisplay.selectionStart;
      selectionEnd = logDisplay.selectionEnd;
    }
    updateFn();
    if (isFocused) {
      logDisplay.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  function formatMessageForDisplay(msg) {
~~~~~

#### Acts 3: 清理 `src/state.js` 并更新 `src/main.js` 引用

从 `state.js` 移除分析逻辑，并在 `main.js` 中更新导入路径。

~~~~~act
patch_file
src/state.js
~~~~~
~~~~~javascript.old
/**
 * 清理一个频道记录中的重复数据。
 * @param {Array<object>} records - 一个频道的聊天记录数组。
 * @returns {{cleanedRecords: Array<object>, removedCount: number}} - 清理后的记录和被移除的记录数。
 */
export function cleanChannelRecords(records) {
  if (!records || records.length === 0) {
    return { cleanedRecords: [], removedCount: 0 };
  }
  const BURST_COUNT_THRESHOLD = 20;
  const BURST_TIME_THRESHOLD_MS = 1000;
  const is_in_burst = new Array(records.length).fill(false);
  if (records.length >= BURST_COUNT_THRESHOLD) {
    for (let i = 0; i <= records.length - BURST_COUNT_THRESHOLD; i++) {
      try {
        const startTime = new Date(records[i].time).getTime();
        const endTime = new Date(records[i + BURST_COUNT_THRESHOLD - 1].time).getTime();
        if (Number.isNaN(startTime) || Number.isNaN(endTime)) continue;
        if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
          for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
            is_in_burst[j] = true;
          }
        }
      } catch (e) {
        // Biome: unnecessary continue
      }
    }
  }
  const cleanedRecords = [];
  const seen_contents = new Set();
  let removedCount = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const content = record.content;
    const has_no_historical_flag = !record.is_historical;
    const is_duplicate = content != null && seen_contents.has(content);
    const in_burst = is_in_burst[i];
    const should_delete = has_no_historical_flag && is_duplicate && in_burst;
    if (!should_delete) {
      cleanedRecords.push(record);
    } else {
      removedCount++;
    }
    if (content != null) {
      seen_contents.add(content);
    }
  }
  return { cleanedRecords, removedCount };
}

/**
 * 检测所有频道中可被清理的重复记录总数。
 * @param {object} messagesByChannel - 包含所有频道消息的对象。
 * @returns {number} - 可被清理的记录总数。
 */
export function detectTotalDuplicates(messagesByChannel) {
  let totalDuplicates = 0;
  if (!messagesByChannel) return 0;
  for (const channel in messagesByChannel) {
    const records = messagesByChannel[channel];
    if (!records || records.length === 0) continue;
    const BURST_COUNT_THRESHOLD = 20;
    const BURST_TIME_THRESHOLD_MS = 1000;
    const is_in_burst = new Array(records.length).fill(false);
    if (records.length >= BURST_COUNT_THRESHOLD) {
      for (let i = 0; i <= records.length - BURST_COUNT_THRESHOLD; i++) {
        try {
          const startTime = new Date(records[i].time).getTime();
          const endTime = new Date(records[i + BURST_COUNT_THRESHOLD - 1].time).getTime();
          if (Number.isNaN(startTime) || Number.isNaN(endTime)) continue;
          if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
            for (let j = i; j < i + BURST_COUNT_THRESHOLD; j++) {
              is_in_burst[j] = true;
            }
          }
        } catch (e) {
          // Biome: unnecessary continue
        }
      }
    }
    const seen_contents = new Set();
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const content = record.content;
      const has_no_historical_flag = !record.is_historical;
      const is_duplicate = content != null && seen_contents.has(content);
      const in_burst = is_in_burst[i];
      if (has_no_historical_flag && is_duplicate && in_burst) {
        totalDuplicates++;
      }
      if (content != null) {
        seen_contents.add(content);
      }
    }
  }
  return totalDuplicates;
}
~~~~~
~~~~~javascript.new
~~~~~

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript.old
import {
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_WARNING_THRESHOLD_MB,
} from './constants.js';
import { extractUsefulData, findActiveTabByClass, locateChatElements } from './parser.js';
import {
  addMessageToSyntheticChannelIfNeeded,
  cleanChannelRecords,
  detectTotalDuplicates,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  saveMessagesToStorage,
} from './state.js';
import { createUI } from './ui.js';
~~~~~
~~~~~javascript.new
import { cleanChannelRecords, detectTotalDuplicates } from './analysis.js';
import {
  OLD_STORAGE_KEY_V4,
  SELF_NAME_KEY,
  STORAGE_KEY_V5,
  STORAGE_WARNING_THRESHOLD_MB,
} from './constants.js';
import { extractUsefulData, findActiveTabByClass, locateChatElements } from './parser.js';
import {
  addMessageToSyntheticChannelIfNeeded,
  loadMessagesFromStorage,
  mergeAndDeduplicateMessages,
  migrateDataV4toV5,
  saveMessagesToStorage,
} from './state.js';
import { createUI } from './ui.js';
~~~~~

### 下一步建议
1.  **引入 `uiState`**: 在 `ui.js` 中创建一个闭包或对象来管理 `currentPage` 和 `pageSize`。
2.  **更新模板**: 在 `templates.js` 中添加分页按钮（上一页/下一页）的 HTML 结构。
3.  **实现切片渲染**: 修改 `displayChatLog`，使其仅渲染当前页的消息段。
