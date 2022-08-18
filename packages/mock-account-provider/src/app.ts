import { Server } from 'http'
import { EventEmitter } from 'events'

import { IocContract } from '@adonisjs/fold'

import Koa, { DefaultState, DefaultContext } from 'koa'
import bodyParser from 'koa-bodyparser'
import session from 'koa-session'
import { Logger } from 'pino'
import Router from '@koa/router'

import { IAppConfig } from './config/app'

export interface AppContextData extends DefaultContext {
  logger: Logger
  closeEmitter: EventEmitter
  container: AppContainer
  // Set by @koa/router
  params: { [key: string]: string }
  // Set by koa-generic-session
  session: { [key: string]: string }
}

export type AppContext = Koa.ParameterizedContext<DefaultState, AppContextData>

export interface AppServices {
  logger: Promise<Logger>
  closeEmitter: Promise<EventEmitter>
  config: Promise<IAppConfig>
}

export type AppContainer = IocContract<AppServices>

export class App {
  private koa!: Koa<DefaultState, AppContext>
  private router!: Router<DefaultState, AppContext>
  private server!: Server
  private closeEmitter!: EventEmitter
  private logger!: Logger
  private config!: IAppConfig
  public isShuttingDown = false

  public constructor(private container: IocContract<AppServices>) {}

  /**
   * The boot function exists because the functions that we register on the container with the `bind` method are async.
   * We then need to await this function when we call use - which can't be done in the constructor. This is a first pass to
   * get the container working. We can refactor this in future. Perhaps don't use private members and just pass around the container?
   * Or provide start / shutdown methods on the services in the container?
   */
  public async boot(): Promise<void> {
    this.config = await this.container.use('config')
    this.koa = new Koa<DefaultState, AppContext>()
    this.closeEmitter = await this.container.use('closeEmitter')
    this.logger = await this.container.use('logger')
    this.koa.context.container = this.container
    this.koa.context.logger = await this.container.use('logger')
    this.koa.context.closeEmitter = await this.container.use('closeEmitter')
    this.router = new Router<DefaultState, AppContext>()

    this.koa.keys = [this.config.cookieKey]
    this.koa.use(
      session(
        {
          key: 'sessionId',
          maxAge: 60 * 1000,
          signed: true
        },
        // Only accepts Middleware<DefaultState, DefaultContext> for some reason, this.koa is Middleware<DefaultState, AppContext>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.koa as any
      )
    )
    this.koa.use(
      async (
        ctx: {
          status: number
          set: (arg0: string, arg1: string) => void
          body: string
        },
        next: () => void | PromiseLike<void>
      ): Promise<void> => {
        if (this.isShuttingDown) {
          ctx.status = 503
          ctx.set('Connection', 'close')
          ctx.body = 'Server is in the process of restarting'
        } else {
          return next()
        }
      }
    )

    await this._setupRoutes()

    this.koa.use(this.router.middleware())
  }

  public listen(port: number | string): void {
    this.server = this.koa.listen(port)
  }

  public async shutdown(): Promise<void> {
    return new Promise((resolve): void => {
      if (this.server) {
        this.isShuttingDown = true
        this.closeEmitter.emit('shutdown')
        this.server.close((): void => {
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  public getPort(): number {
    const address = this.server?.address()
    if (address && !(typeof address == 'string')) {
      return address.port
    }
    return 0
  }

  private async _setupRoutes(): Promise<void> {
    this.router.use(bodyParser())
    this.router.get('/healthz', (ctx: AppContext): void => {
      ctx.status = 200
      ctx.body = 'OK'
    })

    this.router.get('(.*)', (ctx: AppContext): void => {
      ctx.status = 200
      ctx.body = {
        keys: [
          {
            kid: `${ctx.protocol}://${ctx.host}${ctx.path}`,
            x: 'test-public-key',
            kty: 'OKP',
            alg: 'EdDSA',
            crv: 'Ed25519',
            key_ops: ['sign', 'verify'],
            use: 'sig'
          }
        ]
      }
    })
  }
}
