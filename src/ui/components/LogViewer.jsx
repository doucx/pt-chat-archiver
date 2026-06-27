import { useEffect, useMemo, useRef } from 'preact/hooks';
import { UI_MESSAGES } from '../../constants.js';
import { formatMessageForDisplay } from '../../utils.js';
import { currentMessages } from '../store/dataStore';
import {
  currentPage,
  isLockedToBottom,
  isReadOnly,
  isUIPaused,
  lastScrollTop,
  loadingMessage,
  selectedChannel,
  totalPages,
} from '../store/uiStore';
import { Pagination } from './Pagination';

export function LogViewer() {
  const textareaRef = useRef(null);

  const msgs = currentMessages.value;
  const channel = selectedChannel.value;

  // 性能优化：仅当消息列表改变时才重新生成巨型字符串
  const displayText = useMemo(() => {
    if (msgs.length === 0) {
      return UI_MESSAGES.NO_RECORDS_IN_CHANNEL.replace('%s', channel);
    }
    return msgs.map(formatMessageForDisplay).join('\n');
  }, [msgs, channel]);

  const locked = isLockedToBottom.value;
  const curPage = currentPage.value;
  const totPages = totalPages.value;

  // 自动滚动与位置恢复处理
  useEffect(() => {
    if (displayText === undefined || !textareaRef.current) return;

    if (locked && curPage === totPages) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    } else if (!locked && lastScrollTop.value > 0) {
      textareaRef.current.scrollTop = lastScrollTop.value;
    }
  }, [displayText, locked, curPage, totPages]);

  const handleScroll = (e) => {
    const el = e.target;
    if (el.value.startsWith('⏳') || loadingMessage.value) return;

    const threshold = 10;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    if (isLockedToBottom.value && !isAtBottom) {
      isLockedToBottom.value = false;
    } else if (!isLockedToBottom.value && isAtBottom && currentPage.value === totalPages.value) {
      isLockedToBottom.value = true;
    }

    if (!isLockedToBottom.value) {
      lastScrollTop.value = el.scrollTop;
    }
  };

  const handleMouseDown = () => {
    if (!isUIPaused.value) {
      isUIPaused.value = true;
    }
  };

  return (
    <div
      id="log-archive-log-view"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {isReadOnly.value && <div className="readonly-pill">只读存档模式</div>}
      <Pagination />
      <textarea
        ref={textareaRef}
        id="log-archive-ui-log-display"
        readOnly
        style={{ marginTop: '10px', flexGrow: 1 }}
        value={loadingMessage.value || displayText}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
