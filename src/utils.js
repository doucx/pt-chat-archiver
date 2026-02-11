import { storageManager } from './storage/index.js';

/**
 * 计算脚本在 localStorage 中的存储占用空间。
 * @returns {Promise<number>} - 占用的空间大小，单位是 MB。
 */
export async function getStorageUsageInMB() {
  const sizeInBytes = await storageManager.getRawSize();
  return sizeInBytes / (1024 * 1024);
}

/**
 * 简单的异步等待函数
 * @param {number} ms - 毫秒数
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 防抖函数。
 * 当一个函数在短时间内被连续调用时，此函数可以确保它只在最后一次调用之后的一段“冷静期”后执行一次。
 * @param {Function} func - 需要进行防抖处理的函数。
 * @param {number} wait - “冷静期”的毫秒数。
 * @returns {Function} - 返回一个新的、经过防抖处理的函数。
 */
export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/** 获取当前时间的 ISO 8601 UTC 标准格式字符串。*/
export function getISOTimestamp() {
  return new Date().toISOString();
}

/** 在UI界面中，将ISO UTC时间字符串格式化为用户本地时区的可读格式。*/
export function formatISOTimeForDisplay(isoString) {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '日期无效';

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return '日期无效';
  }
}
