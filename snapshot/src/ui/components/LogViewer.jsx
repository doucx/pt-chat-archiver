import { useMemo, useRef, useEffect } from 'preact/hooks';
import { currentMessages } from '../store/dataStore';
import { selectedChannel, isReadOnly, isLockedToBottom, currentPage, totalPages, isUIPaused } from '../store/uiStore';
import { UI_MESSAGES } from '../../constants.js';
import { formatMessageForDisplay } from '../renderer.js';
import { Pagination } from './Pagination';

export function LogViewer() {
  const textareaRef = useRef(null);

  // 性能优化：仅当消息列表改变时才重新生成巨型字符串
  const displayText = useMemo(() => {
    if (currentMessages.value.length === 0) {
      return UI_MESSAGES.NO_RECORDS_IN_CHANNEL.replace('%s', selectedChannel.value);
    }
    return currentMessages.value.map(formatMessageForDisplay).join('\n');
  }, [currentMessages.value, selectedChannel.value]);

  // 自动滚动处理
  useEffect(() => {
    if (isLockedToBottom.value && currentPage.value === totalPages.value && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [displayText, isLockedToBottom.value, currentPage.value, totalPages.value]);

  const handleScroll = (e) => {
    const el = e.target;
    if (displayText.startsWith('⏳')) return;

    const threshold = 10;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    if (isLockedToBottom.value && !isAtBottom) {
      isLockedToBottom.value = false;
    } else if (!isLockedToBottom.value && isAtBottom && currentPage.value === totalPages.value) {
      isLockedToBottom.value = true;
    }
  };

  const handleMouseDown = () => {
    if (!isUIPaused.value) {
      isUIPaused.value = true;
    }
  };

  return (
    <div id="log-archive-log-view" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {isReadOnly.value && <div className="readonly-pill">只读存档模式</div>}
      <Pagination />
      <textarea 
        ref={textareaRef}
        id="log-archive-ui-log-display" 
        readOnly 
        style={{ marginTop: '10px', flexGrow: 1 }}
        value={displayText}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}