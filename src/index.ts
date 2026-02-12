import { Context, Schema } from 'koishi'

export const name = 'isolate'
export const filter = false
export const reusable = true
export const usage = `
---

黑白名单过滤插件 - 通过不断重新注册前置中间件来保持最高优先级。

工作原理：
- 每隔一段时间（默认100ms）重新注册前置中间件
- 由于后注册的前置中间件优先级更高，所以我们的过滤器永远是第一个执行
- 被屏蔽的用户消息会被直接拦截，不会到达任何其他插件

使用方法：
1. 将 isolate 插件和需要保护的插件放在同一个分组
2. 配置黑名单或白名单
3. 插件会自动保持最高优先级，拦截被屏蔽用户的消息

---
`

export interface Config {
  filterMode: 'blacklist' | 'whitelist'
  blacklist: string[]
  whitelist: string[]
  logBlocked: boolean
  reregisterInterval: number
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
  logBlocked: Schema.boolean()
    .description('是否记录被屏蔽用户的消息日志')
    .default(false),
  reregisterInterval: Schema.number()
    .description('重新注册中间件的间隔时间（毫秒），越小优先级越稳定，但性能开销越大')
    .default(100)
    .min(50)
    .max(5000),
})

const kRecord = Symbol.for('koishi.loader.record')

export function apply(ctx: Context, config: Config) {
  ctx.logger.info('启用黑白名单过滤插件，过滤模式: %s', config.filterMode)
  ctx.logger.info('黑名单列表: %o', config.blacklist)
  ctx.logger.info('白名单列表: %o', config.whitelist)
  ctx.logger.info('中间件重新注册间隔: %d ms', config.reregisterInterval)

  // 标记插件是否已启用
  let isActive = true
  let currentDispose: (() => void) | null = null
  let reregisterTimer: NodeJS.Timeout | null = null

  // 注册中间件的函数
  const registerMiddleware = () => {
    // 如果已经有中间件，先注销
    if (currentDispose) {
      currentDispose()
    }

    // 注册新的前置中间件
    currentDispose = ctx.root.middleware((session, next) => {
      if (!isActive) {
        return next()
      }

      const userId = session.userId || session.event?.user?.id

      // 黑白名单过滤逻辑
      if (shouldFilterUser(userId, config)) {
        // 根据配置决定是否输出日志
        if (config.logBlocked) {
          const messageContent = session.content || session.elements?.map(e => e.toString()).join('') || '[无内容]'
          ctx.logger.info('屏蔽用户 %s 消息："%s"', userId, messageContent)
        }

        // 清空消息内容，让后续插件无法获取实际内容
        session.content = ''
        session.elements = []
        if (session.event && session.event.message) {
          session.event.message = { content: '', elements: [] } as any
        }

        // 直接返回，不调用 next()，完全阻止消息传递
        return
      }

      return next()
    }, true) // prepend 确保最先执行
  }

  // 启动轮询：不断重新注册中间件
  const startReregisterLoop = () => {
    // 立即注册一次
    registerMiddleware()
    ctx.logger.info('黑白名单过滤中间件已注册，开始轮询重新注册（间隔 %d ms）', config.reregisterInterval)

    // 设置定时器，不断重新注册
    reregisterTimer = setInterval(() => {
      if (isActive) {
        registerMiddleware()
      }
    }, config.reregisterInterval)
  }

  // 启动轮询
  startReregisterLoop()

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

  // 当插件被禁用时，停止轮询并注销中间件
  ctx.on('dispose', () => {
    isActive = false

    // 停止定时器
    if (reregisterTimer) {
      clearInterval(reregisterTimer)
      reregisterTimer = null
    }

    // 注销中间件
    if (currentDispose) {
      currentDispose()
      currentDispose = null
    }

    ctx.logger.info('黑白名单过滤插件已禁用，轮询已停止，中间件已注销')
  })
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
