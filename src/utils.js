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

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;

/**
 * 生成一个类 ULID 的唯一 ID。
 * 前 10 位为时间戳编码，后 16 位为随机字符。
 * @param {number} seedTime - 种子时间戳（毫秒）。
 * @returns {string} 26 位的唯一标识符。
 */
export function generateULID(seedTime = Date.now()) {
  let time = seedTime;
  let timeChars = '';
  for (let i = 10; i > 0; i--) {
    timeChars = ENCODING.charAt(time % ENCODING_LEN) + timeChars;
    time = Math.floor(time / ENCODING_LEN);
  }

  const randomValues = new Uint8Array(16);
  crypto.getRandomValues(randomValues);
  let randomChars = '';
  for (let i = 0; i < 16; i++) {
    // 256 是 32 (ENCODING_LEN) 的倍数，因此取模分布是均匀的
    randomChars += ENCODING.charAt(randomValues[i] % ENCODING_LEN);
  }

  return timeChars + randomChars;
}

/** 在UI界面中，将ISO UTC时间字符串格式化为用户本地时区的可读格式。*/
export function formatMessageForDisplay(msg) {
  let prefix = '';
  const type = msg.type || '';
  if (type.includes('party')) prefix = '👥 ';
  else if (type.includes('whisper')) prefix = '💬 ';
  else if (type.includes('announcement')) prefix = '📣 ';
  const displayTime = formatISOTimeForDisplay(msg.time);
  return `${displayTime} ${prefix}${msg.content}`;
}

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
