/**
 * 返回 UI 主容器的 HTML 结构。
 * @param {string} version - 应用程序版本号。
 * @returns {string}
 */
export const getMainContainerHTML = (version) => `
    <div id="log-archive-ui-header">
        <div id="log-archive-ui-controls" style="width: 100%; justify-content: space-between;">
            <select id="log-archive-channel-selector" class="log-archive-ui-button" style="flex-grow: 1; margin-right: 10px;"></select>
            <div style="display: flex; gap: 5px;">
                <button id="log-archive-main-reset-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="display: none;">📍</button>
                <button id="log-archive-pause-button" class="log-archive-ui-button" title="暂停/恢复录制">⏸️ </button>
                <button id="log-archive-stats-button" class="log-archive-ui-button" title="数据统计">📊</button>
                <button id="log-archive-settings-button" class="log-archive-ui-button" title="设置">⚙️</button>
                <button id="log-archive-copy-button" class="log-archive-ui-button" title="复制当前页内容">📋</button>
                <button id="log-archive-close-button" class="log-archive-ui-button" title="关闭界面">❌</button>
            </div>
        </div>
    </div>
    
    <div id="log-archive-view-container" style="flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
        <!-- 记录查看视图 -->
        <div id="log-archive-log-view" style="display: flex; flex-direction: column; height: 100%;">
            <div id="log-archive-readonly-indicator" class="readonly-pill">只读存档模式</div>
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
            <!-- 元信息展示区 -->
            <div style="border-bottom: 1px solid var(--color-border); padding-bottom: 15px; margin-bottom: 5px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <h3 style="margin: 0; color: var(--color-primary); font-size: 1.1em;">PT Chat Archiver</h3>
                    <span class="info-text-dim" style="font-size: 0.8em;">v${version}</span>
                </div>
                <div id="log-archive-server-status" style="margin-top: 8px; font-size: 0.85em;">
                    检测中...
                </div>
            </div>

            <div class="config-group">
                <label for="log-archive-server-view-selector">查看存档服务器</label>
                <div class="config-input-row">
                    <select id="log-archive-server-view-selector" class="log-archive-ui-button" style="flex-grow: 1; min-width: 0;"></select>
                    <button id="log-archive-reset-server-button" class="log-archive-ui-button" title="回到正在记录的服务器" style="flex-shrink: 0;">📍</button>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                    <input type="checkbox" id="log-archive-auto-follow-input" style="width: auto; margin: 0;">
                    <label for="log-archive-auto-follow-input" style="font-weight: normal; color: var(--color-text-dim); font-size: 0.85em; cursor: pointer;">跟随游戏服务器切换</label>
                </div>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    切换查看不同服务器的历史记录。注意：此切换仅影响显示，不影响当前的数据录制。
                </div>
            </div>
            <div class="config-group">
                <label for="log-archive-self-name-input">用户昵称</label>
                <input type="text" id="log-archive-self-name-input" placeholder="用于识别私聊方向...">
            </div>
            <div class="config-group">
                <label for="log-archive-page-size-input">分页大小 (每页消息条数)</label>
                <input type="number" id="log-archive-page-size-input" min="10" max="10000" step="100">
            </div>
            <div class="config-group">
                <label for="log-archive-auto-save-interval">自动保存间隔 (秒)</label>
                <input type="number" id="log-archive-auto-save-interval" min="5" max="3600" step="5">
            </div>
            <div class="config-group">
                <label>维护操作</label>
                <div id="log-archive-config-storage-info" class="info-text-dim" style="margin-bottom: 2px;"></div>
                <div id="log-archive-config-msg-count" class="info-text-dim" style="margin-bottom: 8px;"></div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button id="log-archive-save-now-button" class="log-archive-ui-button" style="flex-grow: 1;">💾 立即保存</button>
                        <span id="log-archive-last-saved-info" class="info-text-dim" style="font-size: 0.8em; white-space: nowrap;">未保存</span>
                    </div>
                    <div class="config-actions" style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button id="log-archive-clean-button" class="log-archive-ui-button" style="flex-grow: 1;">清理重复</button>
                        <button id="log-archive-copy-all-button" class="log-archive-ui-button" style="flex-grow: 1;">导出 JSON</button>
                        <button id="log-archive-import-button" class="log-archive-ui-button" style="flex-grow: 1;">📥 导入存档</button>
                        <button id="log-archive-download-button" class="log-archive-ui-button" style="flex-grow: 1;">下载备份</button>
                    </div>
                </div>
            </div>
            <div id="log-archive-legacy-recovery-group" class="config-group" style="margin-top: 10px; display: none; padding: 10px; background: rgba(200, 150, 50, 0.1); border: 1px dashed var(--color-warning);">
                <label style="color: var(--color-warning);">发现残留数据!</label>
                <div id="log-archive-legacy-info" class="info-text-dim" style="margin-bottom: 8px;">
                    检测到旧版本 (v4/v5/v6) 的聊天记录尚未合并到当前数据库。
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="log-archive-recover-button" class="log-archive-ui-button" style="background-color: var(--color-warning); color: #000; flex-grow: 1;">尝试合并旧数据</button>
                    <button id="log-archive-ignore-legacy-button" class="log-archive-ui-button" style="background-color: var(--color-danger); color: #fff; flex-grow: 1;">放弃并清理</button>
                </div>
                <div class="info-text-dim" style="margin-top: 6px; font-size: 0.8em;">
                    此操作将把 localStorage 中的旧记录合并到当前存档的开头，并自动处理重复项。
                </div>
            </div>

            <div id="log-archive-delete-backup-group" class="config-group" style="margin-top: auto; display: none;">
                <label>兼容性清理</label>
                <button id="log-archive-delete-backup-button" class="log-archive-ui-button">删除旧版 LocalStorage 备份</button>
                <div class="info-text-dim" style="margin-top: 4px; font-size: 0.8em;">
                    迁移至新数据库后生成的备份文件，删除可释放浏览器 LocalStorage 空间。
                </div>
            </div>

            <div class="config-group" style="margin-top: 10px; border-top: 1px dashed #444; padding-top: 20px;">
                <label style="color: #ff6666;">危险操作</label>
                <button id="log-archive-clear-button" class="log-archive-ui-button">清空所有本地存档</button>
            </div>
        </div>
    </div>
`;

export const TOGGLE_BUTTON_ICON = '📜';
