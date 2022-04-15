import { Server } from 'http'
import { EventEmitter } from 'events'

import { IocContract } from '@adonisjs/fold'
import Knex from 'knex'
import Koa, { DefaultState } from 'koa'
import bodyParser from 'koa-bodyparser'
import { Logger } from 'pino'
import Router from '@koa/router'

import { IAppConfig } from './config/app'

export interface AppContextData {
  logger: Logger
  closeEmitter: EventEmitter
  container: AppContainer
  // Set by @koa/router
  params: { [key: string]: string }
}

export type AppContext = Koa.ParameterizedContext<DefaultState, AppContextData>

export interface AppServices {
  logger: Promise<Logger>
  knex: Promise<Knex>
  closeEmitter: Promise<EventEmitter>
  config: Promise<IAppConfig>

  // TODO: Add GNAP-related services
}

export type AppContainer = IocContract<AppServices>

export class App {
  private koa!: Koa<DefaultState, AppContext>
  private publicRouter!: Router<DefaultState, AppContext>
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
    this.publicRouter = new Router()

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
    this.publicRouter.use(bodyParser())
    this.publicRouter.get('/healthz', (ctx: AppContext): void => {
      ctx.status = 200
    })

    // TODO: GNAP endpoints
    this.publicRouter.post('/grant/start', (ctx: AppContext): void => {
      // TODO: generate interaction session
      ctx.status = 200
    })

    this.publicRouter.post('/grant/continue', (ctx: AppContext): void => {
      // TODO: generate
      ctx.status = 200
    })

    this.publicRouter.get('/discovery', (ctx: AppContext): void => {
      ctx.body = {
        grant_request_endpoint: '/grant/start',
        interaction_start_modes_supported: ['redirect'],
        interaction_finish_modes_supported: ['redirect']
      }
    })

    // Token management
    this.publicRouter.post('/introspect', (ctx: AppContext): void => {
      // TODO: tokenService.introspection
      ctx.status = 200
      // ctx.body = {
      //   active: boolean
      //   access: [...]
      //   key: JWK
      // }
    })

    this.publicRouter.post('/token/:managementId', (ctx: AppContext): void => {
      // TODO: tokenService.rotate
      ctx.status = 200
    })

    this.publicRouter.del('/token/:managementId', (ctx: AppContext): void => {
      // TODO: tokenService.revocation
      ctx.status = 200
    })

    this.koa.use(this.publicRouter.middleware())
  }
}
