import { currentPage, isLockedToBottom, totalPages } from '../store/uiStore';

export function Pagination() {
  const isFirst = currentPage.value === 1;
  const isLast = currentPage.value === totalPages.value;

  const goToPage = (p) => {
    isLockedToBottom.value = false;
    currentPage.value = Math.max(1, Math.min(p, totalPages.value));
  };

  const toggleLock = () => {
    if (!isLast) {
      currentPage.value = totalPages.value;
    }
    isLockedToBottom.value = !isLockedToBottom.value;
  };

  return (
    <div
      id="log-archive-ui-pagination-controls"
      style={{
        marginTop: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        flexShrink: 0,
      }}
    >
      <button className="log-archive-ui-button" disabled={isFirst} onClick={() => goToPage(1)}>
        «
      </button>
      <button
        className="log-archive-ui-button"
        disabled={isFirst}
        onClick={() => goToPage(currentPage.value - 1)}
      >
        ‹
      </button>
      <span className="info-text-primary">
        {currentPage.value} / {totalPages.value}
      </span>
      <button
        className="log-archive-ui-button"
        disabled={isLast}
        onClick={() => goToPage(currentPage.value + 1)}
      >
        ›
      </button>
      <button
        className={`log-archive-ui-button ${isLockedToBottom.value ? 'active' : ''}`}
        disabled={isLast && isLockedToBottom.value}
        onClick={toggleLock}
        title={isLockedToBottom.value ? '已锁定末尾' : '跳转并锁定到末尾'}
      >
        »
      </button>
    </div>
  );
}
