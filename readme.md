# koishi-plugin-isolate

[![npm](https://img.shields.io/npm/v/koishi-plugin-isolate?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-isolate)

## 黑白名单过滤插件

这是一个基于 Koishi isolate 插件改造的黑白名单过滤插件，支持**消息级过滤**和**指令级权限控制**。

## 功能特性

### 消息级过滤

- ✅ **多维度过滤**：支持按用户ID、频道ID、群组ID、平台名称进行过滤
- ✅ **黑白名单模式**：支持黑名单模式（屏蔽指定对象）和白名单模式（只允许指定对象）
- ✅ **优先级保证**：通过轮询重新注册前置中间件，确保过滤器永远保持最高优先级
- ✅ **消息拦截**：被屏蔽的消息会被清空内容并阻止传递到其他中间件
- ✅ **性能可控**：可调整重新注册间隔来平衡优先级稳定性和性能开销

### 指令级权限控制

- ✅ **精确控制**：针对特定用户限制特定指令的使用权限
- ✅ **通配符支持**：支持 `*` 通配符匹配多个指令（如 `admin.*` 匹配所有 admin 开头的指令）
- ✅ **黑白名单模式**：支持指令黑名单和白名单两种模式
- ✅ **完全阻止**：使用 `ctx.before('command/execute')` 钩子，可以完全阻止指令执行
- ✅ **日志记录**：可选择是否记录被屏蔽指令的详细日志

## 工作原理

### 消息级过滤："力达砖飞"方案

- **轮询重新注册**：每隔一段时间（默认 100ms）重新注册前置中间件
- **优先级保证**：利用"后注册的前置中间件优先级更高"的特性，确保过滤器永远是第一个执行
- **消息拦截**：被屏蔽的消息会被清空内容并阻止传递到其他中间件

### 指令级权限控制

- **before 钩子**：使用 `ctx.before('command/execute')` 在指令执行前拦截
- **精确控制**：可以针对特定用户限制特定指令的使用权限
- **通配符支持**：支持 `*` 通配符匹配多个指令

## 使用方法

### 1. 安装插件

在 Koishi 插件市场搜索 `isolate` 并安装。

### 2. 配置插件

#### 基础配置（消息级过滤）

```yaml
plugins:
  isolate:
    reregisterInterval: 100
    filterMode: blacklist
    blacklist:
      - type: userId
        value: "123456789"
        reason: "垃圾用户"
      - type: platform
        value: "onebot"
        reason: "测试屏蔽"
    logBlocked: true
```

#### 启用指令级权限控制

```yaml
plugins:
  isolate:
    reregisterInterval: 100
    filterMode: blacklist
    blacklist: []
    logBlocked: false

    # 启用指令级过滤
    enableCommandFilter: true
    commandFilterMode: blacklist
    commandBlacklist:
      - userId: "123456789"
        commands:
          - "admin"
          - "ban"
          - "kick"
        reason: "普通用户禁止使用管理指令"
      - userId: "987654321"
        commands:
          - "admin.*"  # 通配符：所有 admin 开头的指令
        reason: "禁止使用所有管理指令"
    logBlockedCommand: true
```

#### 指令白名单模式

```yaml
plugins:
  isolate:
    enableCommandFilter: true
    commandFilterMode: whitelist
    commandWhitelist:
      - userId: "123456789"
        commands:
          - "help"
          - "echo"
        reason: "只允许使用基础指令"
    logBlockedCommand: true
```

### 3. 配置说明

#### 基础配置

| 配置项               | 类型     | 默认值 | 说明                             |
| -------------------- | -------- | ------ | -------------------------------- |
| `reregisterInterval` | `number` | `100`  | 重新注册中间件的间隔时间（毫秒） |

#### 消息级过滤

| 配置项       | 类型                         | 默认值        | 说明             |
| ------------ | ---------------------------- | ------------- | ---------------- |
| `filterMode` | `'blacklist' \| 'whitelist'` | `'blacklist'` | 消息过滤模式     |
| `blacklist`  | `FilterRule[]`               | `[]`          | 消息黑名单规则   |
| `whitelist`  | `FilterRule[]`               | `[]`          | 消息白名单规则   |
| `logBlocked` | `boolean`                    | `false`       | 记录被屏蔽的消息 |

**FilterRule 结构**：

```typescript
interface FilterRule {
  type: 'userId' | 'channelId' | 'guildId' | 'platform'  // 过滤类型
  value: string  // 过滤值
  reason?: string  // 过滤原因（备注）
}
```

支持的过滤类型：

| 类型        | 说明     | 示例                            |
| ----------- | -------- | ------------------------------- |
| `userId`    | 用户 ID  | `123456789`                     |
| `channelId` | 频道 ID  | `987654321`                     |
| `guildId`   | 群组 ID  | `111222333`                     |
| `platform`  | 平台名称 | `onebot`, `discord`, `telegram` |

#### 指令级权限控制

| 配置项                | 类型                         | 默认值        | 说明                 |
| --------------------- | ---------------------------- | ------------- | -------------------- |
| `enableCommandFilter` | `boolean`                    | `false`       | 启用指令级权限控制   |
| `commandFilterMode`   | `'blacklist' \| 'whitelist'` | `'blacklist'` | 指令过滤模式         |
| `commandBlacklist`    | `CommandRule[]`              | `[]`          | 指令黑名单规则       |
| `commandWhitelist`    | `CommandRule[]`              | `[]`          | 指令白名单规则       |
| `logBlockedCommand`   | `boolean`                    | `false`       | 记录被屏蔽的指令调用 |

**CommandRule 结构**：

```typescript
interface CommandRule {
  userId: string      // 用户 ID
  commands: string[]  // 指令列表（支持通配符 *）
  reason?: string     // 限制原因（备注）
}
```

**通配符说明**：

- `*` 匹配任意字符
- `admin.*` 匹配所有 `admin.` 开头的指令（如 `admin.ban`, `admin.kick`）
- `*` 匹配所有指令

## 配置示例

### 示例 1：屏蔽特定用户的所有消息

```yaml
plugins:
  isolate:
    filterMode: blacklist
    blacklist:
      - type: userId
        value: "123456789"
        reason: "垃圾用户"
      - type: userId
        value: "987654321"
        reason: "测试用户"
    logBlocked: true
```

### 示例 2：只允许特定频道发送消息

```yaml
plugins:
  isolate:
    filterMode: whitelist
    whitelist:
      - type: channelId
        value: "channel_001"
        reason: "官方频道"
      - type: channelId
        value: "channel_002"
        reason: "测试频道"
```

### 示例 3：限制用户使用管理指令

```yaml
plugins:
  isolate:
    enableCommandFilter: true
    commandFilterMode: blacklist
    commandBlacklist:
      - userId: "123456789"
        commands:
          - "admin"
          - "ban"
          - "kick"
          - "mute"
        reason: "普通用户禁止使用管理指令"
    logBlockedCommand: true
```

### 示例 4：只允许用户使用基础指令

```yaml
plugins:
  isolate:
    enableCommandFilter: true
    commandFilterMode: whitelist
    commandWhitelist:
      - userId: "123456789"
        commands:
          - "help"
          - "echo"
          - "ping"
        reason: "新用户只能使用基础指令"
      - userId: "admin_001"
        commands:
          - "*"  # 管理员可以使用所有指令
        reason: "管理员"
    logBlockedCommand: true
```

### 示例 5：使用通配符屏蔽指令组

```yaml
plugins:
  isolate:
    enableCommandFilter: true
    commandFilterMode: blacklist
    commandBlacklist:
      - userId: "123456789"
        commands:
          - "admin.*"  # 屏蔽所有 admin 开头的指令
          - "system.*"  # 屏蔽所有 system 开头的指令
        reason: "禁止使用管理和系统指令"
    logBlockedCommand: true
```

### 示例 6：消息级 + 指令级组合使用

```yaml
plugins:
  isolate:
    # 消息级过滤
    filterMode: blacklist
    blacklist:
      - type: userId
        value: "spam_user"
        reason: "垃圾用户，完全屏蔽"
    logBlocked: true

    # 指令级权限控制
    enableCommandFilter: true
    commandFilterMode: blacklist
    commandBlacklist:
      - userId: "normal_user"
        commands:
          - "admin.*"
        reason: "普通用户禁止使用管理指令"
    logBlockedCommand: true
```

## 性能建议

- **reregisterInterval = 100ms**：适合大多数情况，可以保证优先级稳定
- **reregisterInterval = 50ms**：如果遇到其他插件频繁注册前置中间件，可以降低到 50ms
- **reregisterInterval = 500-1000ms**：如果追求性能，可以提高到 500-1000ms，但可能偶尔被其他插件抢占优先级

## 已知限制

### 消息级过滤

由于 Koishi 的中间件和事件系统并行触发，无法保证中间件一定在事件监听器之前执行。因此：

- ✅ 可以拦截中间件链中的消息
- ✅ 可以清空消息内容
- ⚠️ 无法完全阻止事件监听器触发（但它们会获取到空内容）

这意味着使用 `ctx.on('message')` 的插件仍然会收到事件通知，但消息内容已被清空。

### 指令级权限控制

- ✅ 可以完全阻止指令执行（通过 `ctx.before('command/execute')` 钩子）
- ✅ 在指令解析后、执行前拦截，不会有任何副作用

## 常见问题

### Q: 为什么叫"力达砖飞"？

A: 因为这个方案通过不断重新注册中间件来"暴力"保持最高优先级，就像不断地"砸砖头"一样，简单粗暴但非常有效。

### Q: 会不会影响性能？

A: 默认的 100ms 间隔对性能影响很小。如果担心性能，可以将间隔调整到 500-1000ms。

### Q: 为什么不能完全阻止事件监听器？

A: 这是 Koishi 架构的限制。中间件和事件系统是并行触发的，无法控制执行顺序。但我们可以清空消息内容，让事件监听器获取不到实际内容。

### Q: 黑名单和白名单可以同时使用吗？

A: 不可以。`filterMode` 和 `commandFilterMode` 只能分别选择 `blacklist` 或 `whitelist` 其中一种模式。

### Q: 指令级过滤和消息级过滤有什么区别？

A:

- **消息级过滤**：在中间件层面拦截，屏蔽用户的所有消息（包括指令和普通消息）
- **指令级过滤**：在指令执行前拦截，只限制特定指令的使用权限，不影响普通消息

### Q: 通配符 `*` 如何使用？

A:

- `admin.*` 匹配所有 `admin.` 开头的指令（如 `admin.ban`, `admin.kick`）
- `*` 匹配所有指令
- `test*` 匹配所有 `test` 开头的指令

### Q: 如何查看指令的完整名称？

A: 可以在 Koishi 控制台的"指令管理"页面查看所有已注册的指令及其完整名称。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 致谢

- 感谢 Koishi 社区的支持
- 感谢 0v0v0v0 提供的架构思路
