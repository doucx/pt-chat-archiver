## [WIP] fix: 撤销错误的后台静默监听以适应游戏 DOM 刷新机制

### 错误分析

在之前的修改中，为了防止重复扫描，我们将 `uiObserver` 修改为在 `display: none` 时继续保持监听。但根据最新反馈，游戏在聊天框被隐藏时会清空后台 DOM 消息。这导致静默监听失去了意义。更严重的是，当聊天框重新显示时，游戏会逐条重新渲染历史消息。如果不重置监听器状态，这些重新渲染的旧消息可能会绕过初始化防抖逻辑，被错误地识别为实时新消息并无条件插入数据库。

### 用户需求

恢复聊天框隐藏时注销监听器的逻辑。等待进一步分析出正确的 DOM 渲染机制和防重策略。

### 评论

这是一个必要的战术撤退。在彻底摸清游戏如何动态装载和销毁聊天 DOM 之前，绝不能贸然保持监听状态，否则会导致更严重的数据污染。

### 目标

1. 将 `main.js` 中的 `uiObserver` 回退到根据 `chatLogContainer.style.display !== 'none'` 来决定是否激活/注销 Logger 的状态。

### 基本原理

回退代码，确保系统行为可预测，为下一步修复真实的核心假设漏洞（例如防抖机制或实时增量判断机制）扫清障碍。

### 标签

#intent/fix #flow/ready #priority/high #comp/engine #concept/sync #scope/core #ai/delegate #task/domain/sync #task/object/history-merger #task/action/revert #task/state/continue

---

### Script

#### Acts 1: 回退 uiObserver 逻辑

恢复在容器不可见时注销监听器的逻辑。

~~~~~act
patch_file
src/main.js
~~~~~
~~~~~javascript
    const uiObserver = new MutationObserver(() => {
      const { chatLogContainer } = locateChatElements();
      if (chatLogContainer) {
        // 不再因为 display: none 而注销监听器。
        // 这确保了在手机端隐藏聊天框时，依然能在后台正常捕获新消息，
        // 并且避免了反复显示隐藏时触发大量无意义的 DOM 重扫描。
        if (!messageObserver) {
          activateLogger();
        }
      } else if (messageObserver) {
        // 只有当聊天容器彻底从 DOM 中被移除时，才注销监听。
        deactivateLogger();
      }
    });
~~~~~
~~~~~javascript
    const uiObserver = new MutationObserver(() => {
      const { chatLogContainer } = locateChatElements();
      if (chatLogContainer) {
        const isVisible = chatLogContainer.style.display !== 'none';
        if (isVisible && !messageObserver) {
          activateLogger();
        } else if (!isVisible && messageObserver) {
          deactivateLogger();
        }
      } else if (messageObserver) {
        deactivateLogger();
      }
    });
~~~~~

### 下一步建议

代码已回退。请结合我上面列出的三个核心假设，告诉我你认为在反复开关聊天框时，是哪个环节的假设与游戏的实际表现发生了冲突？我们再对症下药。
