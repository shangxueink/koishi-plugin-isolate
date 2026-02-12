import { Context, isNullable, Schema, Session } from 'koishi'
import { } from '@koishijs/plugin-proxy-agent'

export const name = 'isolate'
export const filter = false
export const reusable = true
export const usage = `
启用本插件将会以隔离模式启用本插件组内所有未启用插件，请勿手动操作其余插件，使用此插件统一开关。

双层隔离模式：启用后将创建两层隔离上下文，第一层进行黑白名单过滤，第二层运行业务插件，实现完全屏蔽指定用户。
`

export interface Config {
  isolatedServices: string[]
  proxyAgent?: string
  enableDualLayer?: boolean
  filterMode?: 'none' | 'blacklist' | 'whitelist'
  blacklist?: string[]
  whitelist?: string[]
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enableDualLayer: Schema.boolean().description('启用双层隔离模式（完全屏蔽用户）').default(false),
    isolatedServices: Schema.array(String).role('table').description('要隔离的服务。').default([]),
    proxyAgent: Schema.string().description('代理地址。'),
  }),
  Schema.union([
    Schema.object({
      enableDualLayer: Schema.const(true).required(),
      filterMode: Schema.union(['none', 'blacklist', 'whitelist'])
        .description('过滤模式')
        .default('blacklist'),
      blacklist: Schema.array(String)
        .role('table')
        .description('黑名单用户 ID 列表')
        .default([]),
      whitelist: Schema.array(String)
        .role('table')
        .description('白名单用户 ID 列表')
        .default([]),
    }),
    Schema.object({
      enableDualLayer: Schema.const(false).description('使用传统隔离模式'),
    }),
  ]).description('隔离模式配置'),
])

const kRecord = Symbol.for('koishi.loader.record')

export function apply(_ctx: Context, _config: Config) {
  const config = _ctx.scope.parent.config
  const disabled = Object.keys(config).filter(key => key.startsWith('~') && !key.startsWith('~isolate:'))

  if (_config.enableDualLayer) {
    // 双层隔离模式
    applyDualLayerMode(_ctx, _config, disabled)
  } else {
    // 传统隔离模式
    applyTraditionalMode(_ctx, _config, disabled)
  }
}

// 传统隔离模式（原有逻辑）
function applyTraditionalMode(_ctx: Context, _config: Config, disabled: string[]) {
  let ctx = isNullable(_config.proxyAgent) ? _ctx : _ctx.intercept('http', { proxyAgent: _config.proxyAgent })
  _config.isolatedServices.forEach(name => ctx = ctx.isolate(name))
  ctx.scope[kRecord] = Object.create(null)

  disabled.forEach(key => {
    _ctx.logger.info('apply isolated plugin %c', key.slice(1))
    const reload = () => ctx.loader.reload(ctx, key.slice(1), ctx.scope.parent.config[key]).then(fork => {
      return _ctx.scope.parent.scope[kRecord][key.slice(1)] = new Proxy(fork, {
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

// 双层隔离模式
function applyDualLayerMode(_ctx: Context, _config: Config, disabled: string[]) {
  _ctx.logger.info('启用双层隔离模式，过滤模式: %s', _config.filterMode)

  // 关键改动：在根上下文注册全局过滤中间件
  // 这样所有插件（包括 isolate 组外的插件）都会被过滤
  _ctx.root.middleware((session, next) => {
    const userId = session.userId || session.event?.user?.id

    // 黑白名单过滤逻辑
    if (shouldFilterUser(userId, _config)) {
      const messageContent = session.content || session.elements?.map(e => e.toString()).join('') || '[无内容]'
      _ctx.logger.info('屏蔽用户 %s 消息："%s"', userId, messageContent)
      return // 不调用 next()，完全屏蔽
    }

    // 通过过滤的消息继续传递
    return next()
  }, true) // prepend 确保最先执行

  // 第一层：过滤层上下文
  let filterCtx = isNullable(_config.proxyAgent) ? _ctx : _ctx.intercept('http', { proxyAgent: _config.proxyAgent })
  _config.isolatedServices.forEach(name => filterCtx = filterCtx.isolate(name))

  // 第二层：业务层上下文（在过滤层基础上再隔离）
  let businessCtx = filterCtx.isolate('dual-layer-business')
  businessCtx.scope[kRecord] = Object.create(null)

  // 在业务层加载插件
  disabled.forEach(key => {
    _ctx.logger.info('在业务层加载插件: %c', key.slice(1))
    const reload = () => businessCtx.loader.reload(businessCtx, key.slice(1), businessCtx.scope.parent.config[key]).then(fork => {
      return _ctx.scope.parent.scope[kRecord][key.slice(1)] = new Proxy(fork, {
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

// 判断是否应该过滤用户
function shouldFilterUser(userId: string | undefined, config: Config): boolean {
  if (!userId || config.filterMode === 'none') {
    return false
  }

  if (config.filterMode === 'blacklist') {
    return config.blacklist?.includes(userId) ?? false
  }

  if (config.filterMode === 'whitelist') {
    return !(config.whitelist?.includes(userId) ?? false)
  }

  return false
}
