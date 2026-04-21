import { formatMessageForDisplay } from '../utils.js';

export function createIOManager({ dataAdapter, appCallbacks, refreshView }) {
  const getExportTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  };

  const generateFullTextExport = (state) => {
    let allTextContent = '';
    for (const serverName in state) {
      allTextContent += '\n\n############################################################\n';
      allTextContent += `## 服务器: ${serverName}\n`;
      allTextContent += '############################################################\n';

      const serverData = state[serverName];
      for (const channelName in serverData) {
        allTextContent += `\n\n==================== 频道: ${channelName} ====================\n\n`;
        const messages = serverData[channelName];
        if (Array.isArray(messages)) {
          allTextContent += messages.map(formatMessageForDisplay).join('\n');
        }
      }
    }
    return allTextContent.trim();
  };

  const triggerDownload = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadJSON = async () => {
    const allData = await dataAdapter.getAllData();
    if (Object.keys(allData).length === 0) return;
    triggerDownload(JSON.stringify(allData, null, 2), `pt-saver-${getExportTimestamp()}.json`, 'application/json');
  };

  const downloadTXT = async () => {
    const allData = await dataAdapter.getAllData();
    if (Object.keys(allData).length === 0) return;
    const text = generateFullTextExport(allData);
    triggerDownload(text, `pt-saver-${getExportTimestamp()}.txt`, 'text/plain');
  };

  const copyJSON = async () => {
    const allData = await dataAdapter.getAllData();
    navigator.clipboard.writeText(JSON.stringify(allData, null, 2));
    alert('✅ 已复制 JSON');
  };

  const copyTXT = async () => {
    const allData = await dataAdapter.getAllData();
    navigator.clipboard.writeText(generateFullTextExport(allData));
    alert('✅ 已复制 TXT');
  };

  const importAllData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
            throw new Error('无效的存档格式：根节点必须是一个对象。');
          }

          const serverCount = Object.keys(importedData).length;
          const warning = `准备导入文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n【严重警告】\n此操作将完全清空并覆盖当前浏览器的所有本地存档！\n确定要继续吗？`;

          if (confirm(warning)) {
            await appCallbacks.saveMessagesToStorage(importedData);
            alert('✅ 导入成功');
            refreshView();
          }
        } catch (err) {
          alert(`导入失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const importAndMergeData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
            throw new Error('无效的存档格式。');
          }

          const serverCount = Object.keys(importedData).length;
          const msg = `准备合并文件: ${file.name}\n包含 ${serverCount} 个服务器的数据。\n\n系统将自动跳过重复记录。是否继续？`;

          if (confirm(msg)) {
            await appCallbacks.mergeMessagesToStorage(importedData);
            alert('✅ 合并成功');
            refreshView();
          }
        } catch (err) {
          alert(`合并失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return {
    downloadJSON,
    downloadTXT,
    copyJSON,
    copyTXT,
    importAllData,
    importAndMergeData,
  };
}