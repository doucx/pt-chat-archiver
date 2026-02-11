经过对代码的深入审查，我发现“清理重复记录”功能在引入 V6 嵌套结构（Server -> Channel）后，确实存在一个逻辑漏洞。

目前的 `cleanChannelRecords` 函数在遍历时，错误地假设 `appState` 仍然是 V5 那样的扁平频道映射，而实际上它现在是一个包含服务器名称的对象。这会导致在执行清理时无法正确触达消息数组。

我将生成一个计划来修复这个遍历逻辑，确保它能兼容当前的 IDB/V6 架构。

## [WIP] fix(ui): 修正清理重复记录功能在 V6 嵌套结构下的遍历逻辑

### 错误分析
在 `src/ui/index.js` 中，`cleanChannelRecords` 函数的代码如下：
```javascript
for (const channel in appState) {
  const { cleanedRecords } = appCallbacks.cleanChannelRecords(appState[channel]);
  appState[channel] = cleanedRecords;
}
```
**问题所在**：
1.  `appState` 的结构现在是 `{ "ServerName": { "ChannelName": [...] } }`。
2.  上述代码中的 `channel` 变量实际上迭代的是 **服务器名称**（如 "Pony Town"）。
3.  `appCallbacks.cleanChannelRecords(appState[channel])` 传入的是一个**频道映射对象**，而该函数期望接收的是一个**消息数组**。
4.  这会导致清理逻辑失效，甚至可能在某些情况下导致数据结构损坏。

### 用户需求
确保“清理重复记录”功能在多服务器、多频道（V6/IDB）架构下依然能够精准识别并删除重复项。

### 评论
随着数据结构的演进，维护逻辑必须同步跟进。这是一个典型的由于架构升级导致的“遗留逻辑失效”问题。

### 目标
1.  重构 `src/ui/index.js` 中的 `cleanChannelRecords` 逻辑，增加对服务器层的迭代。
2.  确保 `detectTotalDuplicates` 在 V6 结构下能正确统计总数。

### 基本原理
我们将 `cleanChannelRecords` 的遍历改为两层：外层遍历服务器，内层遍历该服务器下的所有频道。只有触达到最底层的消息数组后，才调用清理算法。

### 标签
#intent/fix #flow/ready #priority/high #comp/ui #concept/state #scope/ux #ai/instruct #task/domain/ui #task/object/clean-logic #task/action/fix #task/state/continue

---

### Script

#### Acts 1: 修正 `src/ui/index.js` 中的遍历逻辑

我们将清理逻辑改为支持 Server -> Channel 的二级嵌套结构。

~~~~~act
patch_file
src/ui/index.js
~~~~~
~~~~~javascript.old
  const cleanChannelRecords = async () => {
    const duplicateCount = appCallbacks.detectTotalDuplicates(appState);
    if (duplicateCount === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${duplicateCount} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const channel in appState) {
        const { cleanedRecords } = appCallbacks.cleanChannelRecords(appState[channel]);
        appState[channel] = cleanedRecords;
      }
      await appCallbacks.saveMessagesToStorage(appState);
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        renderer.render(appState, uiCallbacks); // Re-render to update button
      }, 2000);
    }
  };
~~~~~
~~~~~javascript.new
  const cleanChannelRecords = async () => {
    // 兼容 V6 结构的重复检测
    let totalToClean = 0;
    for (const server in appState) {
      totalToClean += appCallbacks.detectTotalDuplicates(appState[server]);
    }

    if (totalToClean === 0) return alert('未发现可清理的重复记录。');
    if (
      confirm(
        `【确认】此操作将根据特定规则删除 ${totalToClean} 条被识别为错误重复导入的记录。此操作不可逆。确定要继续吗？`,
      )
    ) {
      for (const server in appState) {
        const serverData = appState[server];
        for (const channel in serverData) {
          const { cleanedRecords } = appCallbacks.cleanChannelRecords(serverData[channel]);
          serverData[channel] = cleanedRecords;
        }
      }
      await appCallbacks.saveMessagesToStorage(appState);
      dom.cleanButton.textContent = '清理完毕!';
      setTimeout(() => {
        renderer.render(appState, uiCallbacks); // Re-render to update button
      }, 2000);
    }
  };
~~~~~

#### Acts 2: 完善统计逻辑

确保 `renderer.js` 在显示清理按钮时也能正确遍历 V6 结构。

~~~~~act
patch_file
src/ui/renderer.js
~~~~~
~~~~~javascript.old
      }

      updateCleanButtonState(callbacks.detectTotalDuplicates(appState));
      return;
    }
~~~~~
~~~~~javascript.new
      }

      // 计算所有服务器的重复项总数
      let totalDuplicates = 0;
      for (const server in appState) {
        totalDuplicates += callbacks.detectTotalDuplicates(appState[server]);
      }
      updateCleanButtonState(totalDuplicates);
      return;
    }
~~~~~

### 下一步建议
- **回归测试**：手动构造一些重复数据（通过控制台修改 `inMemoryChatState` 或使用模拟的导入数据），测试清理按钮是否能正确识别出重复项并成功执行删除。
- **性能考虑**：如果存档跨越了数十个服务器，这种多层遍历的开销会增加。不过考虑到 PT 玩家通常只在少数几个服务器活动，目前的实现是安全且清晰的。
