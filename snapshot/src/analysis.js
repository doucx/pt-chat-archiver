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

  // 过滤掉 archiver 消息，仅基于用户消息计算 Burst
  // 我们通过映射索引来回填 is_in_burst 数组
  const userMsgIndices = [];
  for (let i = 0; i < records.length; i++) {
    if (!records[i].is_archiver) userMsgIndices.push(i);
  }

  if (userMsgIndices.length >= BURST_COUNT_THRESHOLD) {
    for (let k = 0; k <= userMsgIndices.length - BURST_COUNT_THRESHOLD; k++) {
      try {
        const startIdx = userMsgIndices[k];
        const endIdx = userMsgIndices[k + BURST_COUNT_THRESHOLD - 1];

        const startTime = new Date(records[startIdx].time).getTime();
        const endTime = new Date(records[endIdx].time).getTime();

        if (Number.isNaN(startTime) || Number.isNaN(endTime)) continue;

        if (endTime - startTime < BURST_TIME_THRESHOLD_MS) {
          // 标记这一段范围内的所有用户消息
          for (let m = k; m < k + BURST_COUNT_THRESHOLD; m++) {
            is_in_burst[userMsgIndices[m]] = true;
          }
        }
      } catch (e) {}
    }
  }
  return is_in_burst;
}

/**
 * 异步、分片扫描所有频道的重复记录，以避免阻塞 UI
 * @param {object} dataAdapter - 数据适配器
 * @returns {Promise<Array<string>>} - 返回所有需要删除的重复记录的 ID 列表
 */
export async function scanAllDuplicatesAsync(dataAdapter) {
  const duplicateIds = [];
  const servers = await dataAdapter.getServers();

  for (const server of servers) {
    const channels = await dataAdapter.getChannels(server);

    for (const channel of channels) {
      const channelMessages = [];
      let lastTime = null;

      // 分片加载当前频道的所有消息
      while (true) {
        const chunk = await dataAdapter.getMessagesChunk(server, channel, lastTime, 5000);
        if (chunk.length === 0) break;
        channelMessages.push(...chunk);
        lastTime = chunk[chunk.length - 1].time;
        if (chunk.length < 5000) break;

        // 关键：在加载每一片后让出主线程，避免 UI 冻结
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // 分析当前频道的重复项
      const is_in_burst = identifyBurstDuplicates(channelMessages);
      const seen_contents = new Set();

      for (let i = 0; i < channelMessages.length; i++) {
        const record = channelMessages[i];
        if (record.is_archiver) continue;

        const content = record.content;
        const is_duplicate = content != null && seen_contents.has(content);
        // 放开限制：允许清理故障产生的、且处于爆发期的重复历史记录
        const should_delete = is_duplicate && is_in_burst[i];

        if (should_delete) {
          duplicateIds.push(record.id);
        }

        if (content != null) seen_contents.add(content);
      }

      // 释放内存，进入下一个频道
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return duplicateIds;
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

    // 彻底忽略 archiver 消息，它们不参与重复检测，也不应该阻断 content 的连续性判断
    if (record.is_archiver) {
      cleanedRecords.push(record);
      continue;
    }

    const content = record.content;
    const is_duplicate = content != null && seen_contents.has(content);
    // 允许清理所有处于爆发期内的绝对重复记录
    const should_delete = is_duplicate && is_in_burst[i];

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
      if (record.is_archiver) continue; // 忽略标记

      const content = record.content;
      if (content != null && seen_contents.has(content) && is_in_burst[i]) {
        totalDuplicates++;
      }
      if (content != null) seen_contents.add(content);
    }
  }
  return totalDuplicates;
}
