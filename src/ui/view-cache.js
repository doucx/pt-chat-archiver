/**
 * 视图缓存系统 (LRU 策略)
 * 用于在内存中缓存最近访问的消息页，提供零延迟的页面切换体验。
 */
export class ViewCache {
  constructor() {
    this.server = null;
    this.channel = null;
    this.pageSize = 1000;
    this.maxPages = 5;
    this.pages = new Map();
    this.totalCount = 0;
  }

  /**
   * 初始化或重置缓存上下文
   */
  init(server, channel, pageSize, maxPages) {
    if (this.server !== server || this.channel !== channel || this.pageSize !== pageSize) {
      this.clear();
      this.server = server;
      this.channel = channel;
      this.pageSize = pageSize;
    }
    this.maxPages = maxPages;
  }

  setTotalCount(count) {
    this.totalCount = count;
  }

  clear() {
    this.pages.clear();
  }

  /**
   * 检查指定页码是否命中缓存，并验证其完整性
   */
  has(page) {
    if (!this.pages.has(page)) return false;
    const msgs = this.pages.get(page);
    const totalPages = Math.ceil(this.totalCount / this.pageSize) || 1;
    const isLastPage = page === totalPages;
    return msgs.length === this.pageSize || isLastPage;
  }

  /**
   * 获取缓存内容并触发 LRU 权重更新
   */
  get(page) {
    const msgs = this.pages.get(page);
    if (msgs) {
      // LRU bump: 重新插入以将其移至 Map 的末尾（最近使用）
      this.pages.delete(page);
      this.pages.set(page, msgs);
    }
    return msgs;
  }

  set(page, messages) {
    this.pages.set(page, [...messages]);
    this.enforceLimit();
  }

  /**
   * 处理实时增量：如果新消息属于当前缓存的频道，更新计数并在末尾页追加
   */
  pushNewMessage(msg) {
    if (msg.server !== this.server || msg.channel !== this.channel) return;
    this.totalCount++;
    const targetPage = Math.ceil(this.totalCount / this.pageSize) || 1;

    if (this.pages.has(targetPage)) {
      this.pages.get(targetPage).push(msg);
    } else {
      const isNewPage = (this.totalCount - 1) % this.pageSize === 0;
      if (isNewPage) {
        this.pages.set(targetPage, [msg]);
      }
    }
    this.enforceLimit();
  }

  /**
   * 强制执行缓存容量限制
   */
  enforceLimit() {
    while (this.pages.size > this.maxPages) {
      const firstKey = this.pages.keys().next().value;
      this.pages.delete(firstKey);
    }
  }
}
