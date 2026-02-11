你的分析和分阶段实施计划非常专业。异步化（Async-First）确实是向 IndexedDB 演进过程中最深层的痛苦，但它为后续的并发控制和按需加载打下了坚实的基础。

现在我们将执行 **Step 2：引入 ID 生成与数据扁平化**。我们将实现一个轻量级的 ULID 生成器（确保时间有序性且易于在 IndexedDB 中作为主键），并编写数据转换器（Transformer），以便在当前的嵌套对象结构和未来的扁平化数组结构之间自由切换。

## [WIP] feat: 引入唯一 ID 生成与数据扁平化转换器

### 用户需求
在消息解析阶段为每条消息生成唯一 ID，并提供一套转换逻辑，支持在 V6 嵌套结构（Server -> Channel -> Messages）与 V7 扁平数组结构之间进行转换。

### 评论
这是架构演进中的关键中间层。ID 的引入解决了消息唯一性识别问题（对去重和精准更新至关重要），而 Transformer 则允许我们在不破坏现有 UI 逻辑的前提下，开始小规模测试扁平化存储模型。

### 目标
1.  在 `utils.js` 中实现一个符合 ULID 规范的轻量级 ID 生成器。
2.  更新 `parser.js`，使解析出的每条消息都携带唯一 ID。
3.  创建 `src/data/transformer.js` 模块，实现 `flattenV6State` 和 `nestV7Messages` 函数。

### 基本原理
- **ULID**: 相比 UUID，ULID 的前 10 位是基于时间戳的编码，这使得消息在数据库中天然按时间顺序排列，极大地提高了范围查询性能。
- **数据转换**: 在迁移期，UI 仍然使用深度嵌套的内存状态以保持响应式，而存储层将通过 `flatten` 将其转换为适合 IndexedDB 存储的扁平列表。

### 标签
#intent/build #flow/ready #priority/high #comp/engine #concept/state #scope/core #ai/instruct #task/domain/storage #task/object/transformer #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 在 `utils.js` 中添加 ULID 生成器

我们将手写一个轻量级的 ULID 生成器，使用 Crockford's Base32 编码。

~~~~~act
patch_file
src/utils.js
~~~~~
~~~~~javascript.old
/** 获取当前时间的 ISO 8601 UTC 标准格式字符串。*/
export function getISOTimestamp() {
  return new Date().toISOString();
}
~~~~~
~~~~~javascript.new
/** 获取当前时间的 ISO 8601 UTC 标准格式字符串。*/
export function getISOTimestamp() {
  return new Date().toISOString();
}

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;

/**
 * 生成一个类 ULID 的唯一 ID。
 * 前 10 位为时间戳编码，后 16 位为随机字符。
 * @param {number} seedTime - 种子时间戳（毫秒）。
 * @returns {string} 26 位的唯一标识符。
 */
export function generateULID(seedTime = Date.now()) {
  let time = seedTime;
  let timeChars = '';
  for (let i = 10; i > 0; i--) {
    timeChars = ENCODING.charAt(time % ENCODING_LEN) + timeChars;
    time = Math.floor(time / ENCODING_LEN);
  }

  let randomChars = '';
  for (let i = 0; i < 16; i++) {
    randomChars += ENCODING.charAt(Math.floor(Math.random() * ENCODING_LEN));
  }

  return timeChars + randomChars;
}
~~~~~

#### Acts 2: 修改 `parser.js` 以包含唯一 ID

我们在消息解析的入口处注入 ID 生成逻辑。

~~~~~act
patch_file
src/parser.js
~~~~~
~~~~~javascript.old
import { MAIN_SERVER_HOSTS } from './constants.js';

/** 判断一个字符的 Unicode 码点是否位于私有使用区。*/
~~~~~
~~~~~javascript.new
import { MAIN_SERVER_HOSTS } from './constants.js';
import { generateULID } from './utils.js';

/** 判断一个字符的 Unicode 码点是否位于私有使用区。*/
~~~~~
~~~~~act
patch_file
src/parser.js
~~~~~
~~~~~javascript.old
export function extractUsefulData(chatLineElement, selfName, precomputedTime) {
  if (!chatLineElement || !precomputedTime) return null;

  const hostname = window.location.hostname;
  const isMainServerMode = MAIN_SERVER_HOSTS.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`),
  );

  if (isMainServerMode) {
    // --- 主服务器精细解析模式 ---
    const data = {
      time: precomputedTime,
      type: 'unknown',
      sender: 'System',
      receiver: 'Local',
      content: '',
    };
~~~~~
~~~~~javascript.new
export function extractUsefulData(chatLineElement, selfName, precomputedTime) {
  if (!chatLineElement || !precomputedTime) return null;

  const timestamp = new Date(precomputedTime).getTime();
  const msgId = generateULID(timestamp);

  const hostname = window.location.hostname;
  const isMainServerMode = MAIN_SERVER_HOSTS.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`),
  );

  if (isMainServerMode) {
    // --- 主服务器精细解析模式 ---
    const data = {
      id: msgId,
      time: precomputedTime,
      type: 'unknown',
      sender: 'System',
      receiver: 'Local',
      content: '',
    };
~~~~~
~~~~~act
patch_file
src/parser.js
~~~~~
~~~~~javascript.old
  // --- 回落模式 (兼容私服) ---
  const rawContent = customTextContent(chatLineElement);
  if (!rawContent.trim()) return null;

  return {
    time: precomputedTime,
    is_fallback: true,
    type: '',
    sender: '',
    receiver: '',
    content: rawContent.trim(),
  };
}
~~~~~
~~~~~javascript.new
  // --- 回落模式 (兼容私服) ---
  const rawContent = customTextContent(chatLineElement);
  if (!rawContent.trim()) return null;

  return {
    id: msgId,
    time: precomputedTime,
    is_fallback: true,
    type: '',
    sender: '',
    receiver: '',
    content: rawContent.trim(),
  };
}
~~~~~

#### Acts 3: 创建 `src/data/transformer.js`

这是用于 V6 <-> V7 数据转换的核心工具类。

~~~~~act
run_command
~~~~~
~~~~~
mkdir -p src/data
touch src/data/transformer.js
~~~~~

~~~~~act
write_file
src/data/transformer.js
~~~~~
~~~~~javascript
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
~~~~~

### 下一步建议

我们已经成功引入了 ID 生成机制和数据转换器。现在的每一条新解析的消息都具备了“身份”。

接下来的 **Step 3** 是核心攻坚期：
1.  **实现 `IndexedDBAdapter`**: 编写基于 Promise 的 IndexedDB 操作封装。
2.  **集成 Transformer**: 在 `IndexedDBAdapter.saveAll` 内部调用 `flatten` 进行存储，在 `loadAll` 内部调用 `nest` 返回给 UI。

如果你准备好了，我们可以开始编写 `src/storage/indexed-db-adapter.js`。
