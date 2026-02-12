# koishi-plugin-isolate

[![npm](https://img.shields.io/npm/v/koishi-plugin-isolate?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-isolate)

## 黑白名单过滤插件

这是一个基于 Koishi isolate 插件改造的黑白名单过滤插件，通过"力达砖飞"的方式实现消息过滤。

## 功能特性

- ✅ **多维度过滤**：支持按用户ID、频道ID、群组ID、平台名称进行过滤
- ✅ **黑白名单模式**：支持黑名单模式（屏蔽指定对象）和白名单模式（只允许指定对象）
- ✅ **优先级保证**：通过轮询重新注册前置中间件，确保过滤器永远保持最高优先级
- ✅ **消息拦截**：被屏蔽的消息会被清空内容并阻止传递到其他中间件
- ✅ **性能可控**：可调整重新注册间隔来平衡优先级稳定性和性能开销
- ✅ **日志记录**：可选择是否记录被屏蔽消息的详细日志

## 工作原理

### "力达砖飞"方案

- **轮询重新注册**：每隔一段时间（默认 100ms）重新注册前置中间件
- **优先级保证**：利用"后注册的前置中间件优先级更高"的特性，确保过滤器永远是第一个执行
- **消息拦截**：被屏蔽的消息会被清空内容并阻止传递到其他中间件

### 过滤规则

支持四种过滤条件：

| 类型        | 说明     | 示例                            |
| ----------- | -------- | ------------------------------- |
| `userId`    | 用户 ID  | `123456789`                     |
| `channelId` | 频道 ID  | `987654321`                     |
| `guildId`   | 群组 ID  | `111222333`                     |
| `platform`  | 平台名称 | `onebot`, `discord`, `telegram` |

### 黑名单模式 vs 白名单模式

- **黑名单模式**：只屏蔽黑名单中的对象，其他全部放行
- **白名单模式**：只放行白名单中的对象，其他全部屏蔽

## 使用方法

### 1. 安装插件

在 Koishi 插件市场搜索 `isolate` 并安装。

### 2. 配置插件

将 isolate 插件和需要保护的插件放在同一个分组：

```yaml
plugins:
  isolate:
    filterMode: blacklist
    blacklist:
      - value: "1919892171"
        type: userId
      - value: "onebot"
        type: platform
    logBlocked: true
    reregisterInterval: 100
```

### 3. 配置说明

| 配置项               | 类型                         | 默认值        | 说明                             |
| -------------------- | ---------------------------- | ------------- | -------------------------------- |
| `filterMode`         | `'blacklist' \| 'whitelist'` | `'blacklist'` | 过滤模式                         |
| `blacklist`          | `FilterRule[]`               | `[]`          | 黑名单规则列表                   |
| `whitelist`          | `FilterRule[]`               | `[]`          | 白名单规则列表                   |
| `logBlocked`         | `boolean`                    | `false`       | 是否记录被屏蔽消息的日志         |
| `reregisterInterval` | `number`                     | `100`         | 重新注册中间件的间隔时间（毫秒） |

#### FilterRule 结构

```typescript
interface FilterRule {
  value: string  // 过滤值（用户ID、频道ID、群组ID或平台名称）
  type: 'userId' | 'channelId' | 'guildId' | 'platform'  // 过滤类型
}
```

## 配置示例

### 示例 1：屏蔽特定用户

```yaml
plugins:
  isolate:
    filterMode: blacklist
    blacklist:
      - value: "123456789"
        type: userId
      - value: "987654321"
        type: userId
    logBlocked: true
```

### 示例 2：只允许特定频道

```yaml
plugins:
  isolate:
    filterMode: whitelist
    whitelist:
      - value: "channel_001"
        type: channelId
      - value: "channel_002"
        type: channelId
```

### 示例 3：屏蔽特定平台

```yaml
plugins:
  isolate:
    filterMode: blacklist
    blacklist:
      - value: "onebot"
        type: platform
```

### 示例 4：混合规则

```yaml
plugins:
  isolate:
    filterMode: blacklist
    blacklist:
      - value: "123456789"
        type: userId
      - value: "channel_spam"
        type: channelId
      - value: "guild_test"
        type: guildId
      - value: "telegram"
        type: platform
    logBlocked: true
    reregisterInterval: 100
```

## 性能建议

- **reregisterInterval = 100ms**：适合大多数情况，可以保证优先级稳定
- **reregisterInterval = 50ms**：如果遇到其他插件频繁注册前置中间件，可以降低到 50ms
- **reregisterInterval = 500-1000ms**：如果追求性能，可以提高到 500-1000ms，但可能偶尔被其他插件抢占优先级

## 已知限制

由于 Koishi 的中间件和事件系统并行触发，无法保证中间件一定在事件监听器之前执行。因此：

- ✅ 可以拦截中间件链中的消息
- ✅ 可以清空消息内容
- ⚠️ 无法完全阻止事件监听器触发（但它们会获取到空内容）

这意味着使用 `ctx.on('message')` 的插件仍然会收到事件通知，但消息内容已被清空。

## 常见问题

### Q: 为什么叫"力达砖飞"？

A: 因为这个方案通过不断重新注册中间件来"暴力"保持最高优先级，就像不断地"砸砖头"一样，简单粗暴但非常有效。

### Q: 会不会影响性能？

A: 默认的 100ms 间隔对性能影响很小。如果担心性能，可以将间隔调整到 500-1000ms。

### Q: 为什么不能完全阻止事件监听器？

A: 这是 Koishi 架构的限制。中间件和事件系统是并行触发的，无法控制执行顺序。但我们可以清空消息内容，让事件监听器获取不到实际内容。

### Q: 黑名单和白名单可以同时使用吗？

A: 不可以。`filterMode` 只能选择 `blacklist` 或 `whitelist` 其中一种模式。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 致谢

- 感谢 Koishi 社区的支持
- 感谢 0v0v0v0 提供的架构思路
