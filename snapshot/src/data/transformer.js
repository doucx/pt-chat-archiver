/**
 * 数据结构转换器
 * 用于在 V6 (嵌套对象) 和 V7 (扁平化数组) 之间转换数据
 */

/**
 * 将 V6 的嵌套结构 (Server -> Channel -> Messages) 展平为 V7 的消息数组。
 * 展平后的消息对象会显式包含 'server' 和 'channel' 字段。
 * @param {object} v6State - 嵌套的内存状态对象。
 * @returns {Array<object>} 展平后的消息数组。
 */
export function flattenV6State(v6State) {
  const flatMessages = [];
  if (!v6State) return flatMessages;

  for (const [serverName, channels] of Object.entries(v6State)) {
    for (const [channelName, messages] of Object.entries(channels)) {
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          flatMessages.push({
            ...msg,
            server: serverName,
            channel: channelName,
          });
        }
      }
    }
  }
  return flatMessages;
}

/**
 * 将 V7 的展平数组转换回 V6 的嵌套结构。
 * 用于保持与现有依赖嵌套结构的 UI 渲染逻辑兼容。
 * @param {Array<object>} flatMessages - 扁平的消息数组。
 * @returns {object} 嵌套的 V6 结构对象。
 */
export function nestV7Messages(flatMessages) {
  const v6State = {};
  if (!Array.isArray(flatMessages)) return v6State;

  for (const msg of flatMessages) {
    const { server, channel, ...rest } = msg;
    if (!server || !channel) continue;

    if (!v6State[server]) v6State[server] = {};
    if (!v6State[server][channel]) v6State[server][channel] = [];
    v6State[server][channel].push(rest);
  }
  return v6State;
}
