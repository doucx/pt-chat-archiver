/**
 * 返回 UI 主容器的 HTML 结构。
 * @param {string} version - 应用程序版本号。
 * @returns {string}
 */
export const getMainContainerHTML = (version) => `
    <div id="log-archive-ui-header">
        <h2>聊天记录存档 v${version}</h2>
        <div id="log-archive-ui-controls">
            <input type="text" id="log-archive-self-name-input" placeholder="输入你的昵称...">
            <select id="log-archive-channel-selector" class="log-archive-ui-button"></select>
            <button id="log-archive-refresh-button" class="log-archive-ui-button">刷新</button>
            <button id="log-archive-pause-button" class="log-archive-ui-button">⏸️ </button>
            <button id="log-archive-stats-button" class="log-archive-ui-button">查看统计</button>
            <button id="log-archive-copy-button" class="log-archive-ui-button">复制</button>
            <button id="log-archive-copy-all-button" class="log-archive-ui-button">复制(JSON)</button>
            <button id="log-archive-download-button" class="log-archive-ui-button">下载</button>
            <button id="log-archive-clean-button" class="log-archive-ui-button">清理重复</button>
            <button id="log-archive-clear-button" class="log-archive-ui-button">清空</button>
            <button id="log-archive-close-button" class="log-archive-ui-button">关闭</button>
        </div>
    </div>
    <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
        <button id="page-first" class="log-archive-ui-button">« 第一页</button>
        <button id="page-prev" class="log-archive-ui-button">‹ 上一页</button>
        <span id="page-info" style="font-weight: bold; color: #a0c8ff;"></span>
        <button id="page-next" class="log-archive-ui-button">下一页 ›</button>
        <button id="page-last" class="log-archive-ui-button">最后一页 »</button>
    </div>
    <textarea id="log-archive-ui-log-display" readonly style="margin-top: 10px;"></textarea>
`;

export const TOGGLE_BUTTON_ICON = '📜';
