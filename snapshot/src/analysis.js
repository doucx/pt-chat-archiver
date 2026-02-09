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