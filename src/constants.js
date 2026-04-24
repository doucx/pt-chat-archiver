// 全局配置与状态
export const STORAGE_KEY_V6 = 'chatLogArchive_v6';
export const SELF_NAME_KEY = 'chatLogArchiver_selfName';
export const CONFIG_KEY = 'chatLogArchive_config';
export const LAST_SERVER_KEY = 'chatLogArchive_lastServer';

// IndexedDB 配置
export const DB_NAME = 'pt-chat-archiver-v7';
export const DB_VERSION = 2;
export const STORE_MESSAGES = 'messages';
export const STORE_CONFIG = 'config';

// 定义被视为主服务器的域名列表，以启用精细化解析
export const MAIN_SERVER_HOSTS = ['pony.town'];

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
