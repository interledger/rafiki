import { Logger } from 'pino'
import { IAppConfig } from './config/app'
import { IocContract } from '@adonisjs/fold'
import Koa, { DefaultState } from 'koa'
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { Server } from 'http'
import cors from '@koa/cors'
import { createValidatorMiddleware, HttpMethod } from '@interledger/openapi'
import { PaymentContext } from './payment/types'
import { PaymentEventContext } from './payment/types'

export interface AppServices {
  logger: Promise<Logger>
  config: Promise<IAppConfig>
}

export type AppContainer = IocContract<AppServices>

export interface AppContextData {
  logger: Logger
  container: AppContainer
  // Set by @koa/router.
  params: { [key: string]: string }
}

export type AppContext = Koa.ParameterizedContext<DefaultState, AppContextData>

export class App {
  private cardServiceServer!: Server
  private isShuttingDown = false
  private logger!: Logger
  private config!: IAppConfig

  public constructor(private container: IocContract<AppServices>) {}

  public async boot() {
    this.config = await this.container.use('config')
    this.logger = await this.container.use('logger')
  }

  public async startCardServiceServer(port: number | string): Promise<void> {
    const koa = await this.createKoaServer()
    const router = new Router<DefaultState, AppContext>()
    router.use(bodyParser())

    router.get('/healthz', (ctx: AppContext): void => {
      ctx.status = 200
    })

    const openApi = await this.container.use('openApi')

    const paymentRoutes = await this.container.use('paymentRoutes')
    router.post<DefaultState, PaymentContext>(
      '/payment',
      createValidatorMiddleware<PaymentContext>(openApi.cardServerSpec, {
        path: '/payment',
        method: HttpMethod.POST
      }),
      paymentRoutes.create
    )

    router.post<DefaultState, PaymentEventContext>(
      '/payment-event',
      createValidatorMiddleware<PaymentEventContext>(openApi.cardServerSpec, {
        path: '/payment-event',
        method: HttpMethod.POST
      }),
      paymentRoutes.paymentEvent
    )

    koa.use(cors())
    koa.use(router.routes())

    this.cardServiceServer = koa.listen(port)
  }

  public async shutdown(): Promise<void> {
    this.isShuttingDown = true
    if (this.cardServiceServer) {
      await this.stopServer(this.cardServiceServer)
    }
  }

  public getCardServicePort(): number {
    return this.getPort(this.cardServiceServer)
  }

  private getPort(server: Server): number {
    const address = server?.address()
    if (address && !(typeof address == 'string')) {
      return address.port
    }
    return 0
  }

  private async createKoaServer(): Promise<Koa<Koa.DefaultState, AppContext>> {
    const koa = new Koa<DefaultState, AppContext>({
      proxy: this.config.trustProxy
    })

    koa.context.container = this.container
    koa.context.logger = this.logger

    koa.use(
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

    return koa
  }

  private async stopServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err)
        }

        resolve()
      })
    })
  }
}
