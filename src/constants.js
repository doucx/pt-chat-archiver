// 全局配置与状态
export const STORAGE_KEY_V6 = 'chatLogArchive_v6';
export const STORAGE_KEY_V5 = 'chatLogArchive_v5';
export const OLD_STORAGE_KEY_V4 = 'chatLogArchive_v4';
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
