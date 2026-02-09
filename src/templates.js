/**
 * 返回 UI 主容器的 HTML 结构。
 * @param {string} version - 应用程序版本号。
 * @returns {string}
 */
export const getMainContainerHTML = (version) => `
    <div id="log-archive-ui-header">
        <h2>聊天记录存档 v${version}</h2>
        <div id="log-archive-ui-controls">
            <select id="log-archive-channel-selector" class="log-archive-ui-button"></select>
            <button id="log-archive-pause-button" class="log-archive-ui-button">⏸️ </button>
            <button id="log-archive-stats-button" class="log-archive-ui-button">📊 统计</button>
            <button id="log-archive-settings-button" class="log-archive-ui-button">⚙️ 设置</button>
            <button id="log-archive-copy-button" class="log-archive-ui-button">复制</button>
            <button id="log-archive-download-button" class="log-archive-ui-button">下载</button>
            <button id="log-archive-close-button" class="log-archive-ui-button">关闭</button>
        </div>
    </div>
    
    <div id="log-archive-view-container" style="flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
        <!-- 记录查看视图 -->
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-ui-pagination-controls" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;">
                <button id="page-first" class="log-archive-ui-button">«</button>
                <button id="page-prev" class="log-archive-ui-button">‹</button>
                <span id="page-info" class="info-text-primary"></span>
                <button id="page-next" class="log-archive-ui-button">›</button>
                <button id="page-last" class="log-archive-ui-button">»</button>
            </div>
            <textarea id="log-archive-ui-log-display" readonly style="margin-top: 10px; flex-grow: 1;"></textarea>
        </div>

        <!-- 设置视图 -->
        <div id="log-archive-config-view" class="config-section" style="display: none;">
            <div class="config-group">
                <label>用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label>分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" class="info-text-dim" style="margin-bottom: 5px;"></div>
                <div class="config-actions">
                    <button id="log-archive-clean-button" class="log-archive-ui-button">清理重复记录</button>
                    <button id="log-archive-copy-all-button" class="log-archive-ui-button">导出原始数据 (JSON)</button>
                </div>
            </div>
            <div class="config-group" style="margin-top: auto; border-top: 1px dashed #444; padding-top: 20px;">
                <label style="color: #ff6666;">危险操作</label>
                <button id="log-archive-clear-button" class="log-archive-ui-button">清空所有本地存档</button>
            </div>
        </div>
    </div>
`;

export const TOGGLE_BUTTON_ICON = '📜';
