import { Server } from 'http'
import { EventEmitter } from 'events'

import { IocContract } from '@adonisjs/fold'
import Knex from 'knex'
import Koa, { Context, DefaultState } from 'koa'
import bodyParser from 'koa-bodyparser'
import { Logger } from 'pino'
import Router from '@koa/router'
import { Client } from 'tigerbeetle-node'

import { AccountsService } from './services'
import { Config } from './config'

export interface AppContext extends Context {
  logger: Logger
  closeEmitter: EventEmitter
  container: AppContainer
}

export interface AppServices {
  logger: Promise<Logger>
  knex: Promise<Knex>
  closeEmitter: Promise<EventEmitter>
  config: Promise<typeof Config>
  tigerbeetle: Promise<Client>
}

export type AppContainer = IocContract<AppServices>

export class App {
  private koa: Koa<DefaultState, AppContext>
  private publicRouter: Router<DefaultState, AppContext>
  private server: Server | undefined
  public isShuttingDown = false
  private accounts: AccountsService

  private constructor(
    private container: IocContract<AppServices>,
    private config: typeof Config,
    private logger: Logger,
    private closeEmitter: EventEmitter,
    tigerbeetle: Client
  ) {
    this.koa = new Koa<DefaultState, AppContext>()
    this.accounts = new AccountsService(tigerbeetle, this.logger)
    this.koa.context.container = this.container
    this.koa.context.logger = this.logger
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
    this._setupRoutes()
  }

  public static async createApp(
    container: IocContract<AppServices>
  ): Promise<App> {
    return new App(
      container,
      await container.use('config'),
      await container.use('logger'),
      await container.use('closeEmitter'),
      await container.use('tigerbeetle')
    )
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

  private _setupRoutes(): void {
    this.publicRouter.use(bodyParser())
    this.publicRouter.get('/healthz', (ctx: AppContext): void => {
      ctx.status = 200
    })

    this.koa.use(this.publicRouter.middleware())
  }

  public getAccounts(): AccountsService {
    return this.accounts
  }
}
