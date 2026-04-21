# 📸 Snapshot Capture

检测到工作区发生变更。

### 📝 变更文件摘要:
```
src/ui/App.jsx                    |  17 ++--
 src/ui/components/ConfigPanel.jsx | 189 +++++++++++++++++++++++++++++---------
 src/ui/components/Header.jsx      |  85 ++++++++++++-----
 src/ui/components/LogViewer.jsx   |  27 ++++--
 src/ui/components/Pagination.jsx  |  53 +++++++++--
 src/ui/components/StatsView.jsx   |  15 +--
 src/ui/index.jsx                  |  71 ++++++++++----
 src/ui/io-manager.js              |  20 +++-
 src/ui/store/dataStore.js         |   2 +-
 src/ui/store/uiStore.js           |  17 ++--
 vite.config.js                    |   2 +-
 11 files changed, 369 insertions(+), 129 deletions(-)
```