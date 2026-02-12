import { Context, Schema } from 'koishi'

export const name = 'isolate'
export const filter = false
export const reusable = true
export const usage = `
黑白名单过滤插件 - 基于 isolate 双层隔离架构实现完全屏蔽指定用户。

工作原理：
- 在根上下文注册全局过滤中间件（最高优先级）
- 被屏蔽用户的消息在进入任何插件之前就被拦截
- 所有插件（包括统计、前置中间件等）都看不到被屏蔽用户
`

export interface Config {
  filterMode: 'blacklist' | 'whitelist'
  blacklist: string[]
  whitelist: string[]
}

export const Config: Schema<Config> = Schema.object({
  filterMode: Schema.union(['blacklist', 'whitelist'])
    .description('过滤模式：blacklist=黑名单模式，whitelist=白名单模式')
    .default('blacklist'),
  blacklist: Schema.array(String)
    .role('table')
    .description('黑名单用户 ID 列表（filterMode=blacklist 时生效）')
    .default([]),
  whitelist: Schema.array(String)
    .role('table')
    .description('白名单用户 ID 列表（filterMode=whitelist 时生效，只有这些用户能通过）')
    .default([]),
})

const kRecord = Symbol.for('koishi.loader.record')

export function apply(ctx: Context, config: Config) {
  ctx.logger.info('启用黑白名单过滤插件，过滤模式: %s', config.filterMode)

  // 在根上下文注册全局过滤中间件
  // 这样所有插件（包括 isolate 组外的插件）都会被过滤
  ctx.root.middleware((session, next) => {
    const userId = session.userId || session.event?.user?.id

    // 黑白名单过滤逻辑
    if (shouldFilterUser(userId, config)) {
      const messageContent = session.content || session.elements?.map(e => e.toString()).join('') || '[无内容]'
      ctx.logger.info('屏蔽用户 %s 消息："%s"', userId, messageContent)
      return // 不调用 next()，完全屏蔽
    }

    // 通过过滤的消息继续传递
    return next()
  }, true) // prepend 确保最先执行

  // 加载插件组内的插件（如果有的话）
  const parentConfig = ctx.scope.parent.config
  const disabled = Object.keys(parentConfig).filter(key => key.startsWith('~') && !key.startsWith('~isolate:'))

  if (disabled.length > 0) {
    ctx.logger.info('检测到 %d 个插件组内的插件', disabled.length)

    // 创建隔离上下文用于加载插件
    const isolateCtx = ctx.isolate('blacklist-isolate')
    isolateCtx.scope[kRecord] = Object.create(null)

    // 在隔离上下文中加载插件
    disabled.forEach(key => {
      ctx.logger.info('加载插件: %c', key.slice(1))
      const reload = () => isolateCtx.loader.reload(isolateCtx, key.slice(1), isolateCtx.scope.parent.config[key]).then(fork => {
        return ctx.scope.parent.scope[kRecord][key.slice(1)] = new Proxy(fork, {
          get(target, prop) {
            if (prop === 'dispose') {
              return async () => {
                await Promise.resolve()
                return reload()
              }
            }
            return Reflect.get(target, prop)
          },
        })
      })
      reload()
    })
  }
}

// 判断是否应该过滤用户
function shouldFilterUser(userId: string | undefined, config: Config): boolean {
  if (!userId) {
    // 如果没有用户 ID，白名单模式下屏蔽，黑名单模式下放行
    return config.filterMode === 'whitelist'
  }

  if (config.filterMode === 'blacklist') {
    // 黑名单模式：如果用户在黑名单中，则屏蔽
    return config.blacklist.includes(userId)
  }

  if (config.filterMode === 'whitelist') {
    // 白名单模式：如果用户不在白名单中，则屏蔽
    return !config.whitelist.includes(userId)
  }

  return false
}
