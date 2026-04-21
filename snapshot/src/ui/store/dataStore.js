import { signal } from '@preact/signals';

// --- 共享的数据状态 ---
export const serverList = signal([]);
export const channelList = signal([]);
export const channelCounts = signal({});
export const currentMessages = signal([]);
export const totalCount = signal(0);