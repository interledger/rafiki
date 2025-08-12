import { Knex } from 'knex'
import { Logger } from 'pino'
import { IAppConfig } from './config/app'
import { Server } from 'http'
import { IocContract } from '@adonisjs/fold'
import Koa, { DefaultState } from 'koa'
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import cors from '@koa/cors'
import {
  CreateMerchantContext,
  DeleteMerchantContext,
  MerchantRoutes
} from './merchant/routes'
import {
  PosDeviceRoutes,
  RegisterDeviceContext
} from './merchant/devices/routes'
import { PosDeviceService } from './merchant/devices/service'
import { MerchantService } from './merchant/service'
import { PaymentContext, PaymentRoutes } from './payments/routes'

export interface AppServices {
  logger: Promise<Logger>
  knex: Promise<Knex>
  config: Promise<IAppConfig>
  merchantRoutes: Promise<MerchantRoutes>
  posDeviceRoutes: Promise<PosDeviceRoutes>
  posDeviceService: Promise<PosDeviceService>
  merchantService: Promise<MerchantService>
  paymentRoutes: Promise<PaymentRoutes>
}

export type AppContainer = IocContract<AppServices>

export interface AppContextData {
  logger: Logger
  container: AppContainer
  // Set by @koa/router.
  params: { [key: string]: string }
}

export type AppContext = Koa.ParameterizedContext<DefaultState, AppContextData>

export type AppRequest<ParamsT extends string = string> = Omit<
  AppContext['request'],
  'params'
> & {
  params: Record<ParamsT, string>
}

export class App {
  private posServer!: Server
  public isShuttingDown = false
  private logger!: Logger
  private config!: IAppConfig

  public constructor(private container: IocContract<AppServices>) {}

  public async boot(): Promise<void> {
    this.config = await this.container.use('config')
    this.logger = await this.container.use('logger')
  }

  public async startPosServer(port: number): Promise<void> {
    const koa = await this.createKoaServer()

    const router = new Router<DefaultState, AppContext>()
    router.use(bodyParser())
    router.get('/healthz', (ctx: AppContext): void => {
      ctx.status = 200
    })

    const merchantRoutes = await this.container.use('merchantRoutes')
    const posDeviceRoutes = await this.container.use('posDeviceRoutes')
    const paymentRoutes = await this.container.use('paymentRoutes')

    // POST /merchants
    // Create merchant
    router.post<DefaultState, CreateMerchantContext>(
      '/merchants',
      merchantRoutes.create
    )

    // DELETE /merchants/:merchantId
    // Delete merchant
    router.delete<DefaultState, DeleteMerchantContext>(
      '/merchants/:merchantId',
      merchantRoutes.delete
    )

    // POST /merchant/:merchantId/devices
    // Register a device
    router.post<DefaultState, RegisterDeviceContext>(
      '/merchants/:merchantId/devices',
      posDeviceRoutes.register
    )

    // POST /payment
    // Initiate a payment
    router.post<DefaultState, PaymentContext>('/payment', paymentRoutes.payment)

    koa.use(cors())
    koa.use(router.routes())

    this.posServer = koa.listen(port)
  }

  public async shutdown(): Promise<void> {
    this.isShuttingDown = true

    if (this.posServer) {
      await this.stopServer(this.posServer)
    }
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

  public getPort() {
    const address = this.posServer?.address()
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
}
