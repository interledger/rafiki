import assert from 'assert'
import { join } from 'path'
import { Server } from 'http'
import { EventEmitter } from 'events'
import { ParsedUrlQuery } from 'querystring'

import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import Koa, { DefaultState } from 'koa'
import bodyParser from 'koa-bodyparser'
import { Logger } from 'pino'
import Router from '@koa/router'
import { ApolloServer } from 'apollo-server-koa'

import { IAppConfig } from './config/app'
import { addResolversToSchema } from '@graphql-tools/schema'
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader'
import { loadSchemaSync } from '@graphql-tools/load'

import { resolvers } from './graphql/resolvers'
import { HttpTokenService } from './httpToken/service'
import { AssetService } from './asset/service'
import { AccountingService } from './accounting/service'
import { PeerService } from './peer/service'
import { createPaymentPointerMiddleware } from './open_payments/payment_pointer/middleware'
import { PaymentPointer } from './open_payments/payment_pointer/model'
import { PaymentPointerService } from './open_payments/payment_pointer/service'
import { AccessType, AccessAction, Grant } from './open_payments/auth/grant'
import { createAuthMiddleware } from './open_payments/auth/middleware'
import { AuthService } from './open_payments/auth/service'
import { RatesService } from './rates/service'
import { SPSPRoutes } from './spsp/routes'
import { IncomingPaymentRoutes } from './open_payments/payment/incoming/routes'
import { ClientKeysRoutes } from './clientKeys/routes'
import { PaymentPointerRoutes } from './open_payments/payment_pointer/routes'
import { IncomingPaymentService } from './open_payments/payment/incoming/service'
import { StreamServer } from '@interledger/stream-receiver'
import { WebhookService } from './webhook/service'
import { QuoteRoutes } from './open_payments/quote/routes'
import { QuoteService } from './open_payments/quote/service'
import { OutgoingPaymentRoutes } from './open_payments/payment/outgoing/routes'
import { OutgoingPaymentService } from './open_payments/payment/outgoing/service'
import { PageQueryParams } from './shared/pagination'
import { IlpPlugin, IlpPluginOptions } from './shared/ilp_plugin'
import { ApiKeyService } from './apiKey/service'
import { SessionService } from './session/service'
import { addDirectivesToSchema } from './graphql/directives'
import { Session } from './session/util'
import { createValidatorMiddleware, HttpMethod, isHttpMethod } from 'openapi'
import { ClientKeysService } from './clientKeys/service'
import { ClientService } from './clients/service'
import { GrantReferenceService } from './open_payments/grantReference/service'

export interface AppContextData {
  logger: Logger
  closeEmitter: EventEmitter
  container: AppContainer
  // Set by @koa/router.
  params: { [key: string]: string }
  paymentPointer?: PaymentPointer
}

export interface ApolloContext {
  container: IocContract<AppServices>
  logger: Logger
  admin: boolean
  session: Session | undefined
}
export type AppContext = Koa.ParameterizedContext<DefaultState, AppContextData>

export type AppRequest<ParamsT extends string = string> = Omit<
  AppContext['request'],
  'params'
> & {
  params: Record<ParamsT, string>
}

type Context<T> = Omit<AppContext, 'request'> & {
  request: T
}

export type ClientKeysContext = Context<AppRequest<'keyId'>>

export interface PaymentPointerContext extends AppContext {
  paymentPointer: PaymentPointer
  grant?: Grant
  clientId?: string
}

// Payment pointer subresources
type CollectionRequest<BodyT = never, QueryT = ParsedUrlQuery> = Omit<
  PaymentPointerContext['request'],
  'body'
> & {
  body: BodyT
  query: ParsedUrlQuery & QueryT
}

type CollectionContext<BodyT = never, QueryT = ParsedUrlQuery> = Omit<
  PaymentPointerContext,
  'request'
> & {
  request: CollectionRequest<BodyT, QueryT>
}

type SubresourceRequest = Omit<AppContext['request'], 'params'> & {
  params: Record<'id', string>
}

type SubresourceContext = Omit<PaymentPointerContext, 'request'> & {
  request: SubresourceRequest
}

export type CreateContext<BodyT> = CollectionContext<BodyT>
export type ReadContext = SubresourceContext
export type CompleteContext = SubresourceContext
export type ListContext = CollectionContext<never, PageQueryParams>

type ContextType<T> = T extends (
  ctx: infer Context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => any
  ? Context
  : never

const PAYMENT_POINTER_PATH = '/:paymentPointerPath+'

export interface AppServices {
  logger: Promise<Logger>
  knex: Promise<Knex>
  closeEmitter: Promise<EventEmitter>
  config: Promise<IAppConfig>
  httpTokenService: Promise<HttpTokenService>
  assetService: Promise<AssetService>
  accountingService: Promise<AccountingService>
  peerService: Promise<PeerService>
  authService: Promise<AuthService>
  paymentPointerService: Promise<PaymentPointerService>
  spspRoutes: Promise<SPSPRoutes>
  incomingPaymentRoutes: Promise<IncomingPaymentRoutes>
  outgoingPaymentRoutes: Promise<OutgoingPaymentRoutes>
  quoteRoutes: Promise<QuoteRoutes>
  clientKeysRoutes: Promise<ClientKeysRoutes>
  paymentPointerRoutes: Promise<PaymentPointerRoutes>
  incomingPaymentService: Promise<IncomingPaymentService>
  streamServer: Promise<StreamServer>
  webhookService: Promise<WebhookService>
  quoteService: Promise<QuoteService>
  outgoingPaymentService: Promise<OutgoingPaymentService>
  makeIlpPlugin: Promise<(options: IlpPluginOptions) => IlpPlugin>
  ratesService: Promise<RatesService>
  apiKeyService: Promise<ApiKeyService>
  sessionService: Promise<SessionService>
  clientService: Promise<ClientService>
  clientKeysService: Promise<ClientKeysService>
  grantReferenceService: Promise<GrantReferenceService>
}

export type AppContainer = IocContract<AppServices>

export class App {
  private openPaymentsServer!: Server
  private adminServer!: Server
  public apolloServer!: ApolloServer
  public closeEmitter!: EventEmitter
  public isShuttingDown = false
  private logger!: Logger
  private config!: IAppConfig
  private outgoingPaymentTimer!: NodeJS.Timer
  private deactivateInvoiceTimer!: NodeJS.Timer

  public constructor(private container: IocContract<AppServices>) {}

  /**
   * The boot function exists because the functions that we register on the container with the `bind` method are async.
   * We then need to await this function when we call use - which can't be done in the constructor. This is a first pass to
   * get the container working. We can refactor this in future. Perhaps don't use private members and just pass around the container?
   * Or provide start / shutdown methods on the services in the container?
   */
  public async boot(): Promise<void> {
    this.config = await this.container.use('config')
    this.closeEmitter = await this.container.use('closeEmitter')
    this.logger = await this.container.use('logger')

    // Workers are in the way during tests.
    if (this.config.env !== 'test') {
      for (let i = 0; i < this.config.paymentPointerWorkers; i++) {
        process.nextTick(() => this.processPaymentPointer())
      }
      for (let i = 0; i < this.config.outgoingPaymentWorkers; i++) {
        process.nextTick(() => this.processOutgoingPayment())
      }
      for (let i = 0; i < this.config.incomingPaymentWorkers; i++) {
        process.nextTick(() => this.processIncomingPayment())
      }
      for (let i = 0; i < this.config.webhookWorkers; i++) {
        process.nextTick(() => this.processWebhook())
      }
    }
  }

  public async startAdminServer(port: number | string): Promise<void> {
    const koa = await this.createKoaServer()

    // Load schema from the file
    const schema = loadSchemaSync(join(__dirname, './graphql/schema.graphql'), {
      loaders: [new GraphQLFileLoader()]
    })

    // Add resolvers to the schema
    const schemaWithResolvers = addResolversToSchema({
      schema,
      resolvers
    })

    let schemaWithDirectives = schemaWithResolvers
    // Add directives to schema
    if (this.config.env !== 'test') {
      schemaWithDirectives = addDirectivesToSchema(schemaWithResolvers)
    }

    // Setup Apollo on graphql endpoint
    this.apolloServer = new ApolloServer({
      schema: schemaWithDirectives,
      context: async ({ ctx }: Koa.Context): Promise<ApolloContext> => {
        const admin = this._isAdmin(ctx)
        const session = await this._getSession(ctx)
        return {
          container: this.container,
          logger: await this.container.use('logger'),
          admin,
          session
        }
      }
    })

    await this.apolloServer.start()
    koa.use(this.apolloServer.getMiddleware())

    this.adminServer = koa.listen(port)
  }

  public async startOpenPaymentsServer(port: number | string): Promise<void> {
    const koa = await this.createKoaServer()

    const router = new Router<DefaultState, AppContext>()
    router.use(bodyParser())
    router.get('/healthz', (ctx: AppContext): void => {
      ctx.status = 200
    })

    const spspRoutes = await this.container.use('spspRoutes')
    const clientKeysRoutes = await this.container.use('clientKeysRoutes')
    const paymentPointerRoutes = await this.container.use(
      'paymentPointerRoutes'
    )
    const incomingPaymentRoutes = await this.container.use(
      'incomingPaymentRoutes'
    )
    const outgoingPaymentRoutes = await this.container.use(
      'outgoingPaymentRoutes'
    )
    const quoteRoutes = await this.container.use('quoteRoutes')
    const connectionRoutes = await this.container.use('connectionRoutes')
    const openApi = await this.container.use('openApi')
    const toRouterPath = (path: string): string =>
      path.replace(/{/g, ':').replace(/}/g, '')

    const toAction = ({
      path,
      method
    }: {
      path: string
      method: HttpMethod
    }): AccessAction | undefined => {
      switch (method) {
        case HttpMethod.GET:
          return path.endsWith('{id}') ? AccessAction.Read : AccessAction.List
        case HttpMethod.POST:
          return path.endsWith('/complete')
            ? AccessAction.Complete
            : AccessAction.Create
        default:
          return undefined
      }
    }

    const actionToRoute: {
      [key in AccessAction]: string
    } = {
      [AccessAction.Create]: 'create',
      [AccessAction.Read]: 'get',
      [AccessAction.ReadAll]: 'get',
      [AccessAction.Complete]: 'complete',
      [AccessAction.List]: 'list',
      [AccessAction.ListAll]: 'list'
    }

    for (const path in openApi.paths) {
      for (const method in openApi.paths[path]) {
        if (isHttpMethod(method)) {
          const action = toAction({ path, method })
          assert.ok(action)

          let type: AccessType
          let route: (ctx: AppContext) => Promise<void>
          if (path.includes('incoming-payments')) {
            type = AccessType.IncomingPayment
            route = incomingPaymentRoutes[actionToRoute[action]]
          } else if (path.includes('outgoing-payments')) {
            type = AccessType.OutgoingPayment
            route = outgoingPaymentRoutes[actionToRoute[action]]
          } else if (path.includes('quotes')) {
            type = AccessType.Quote
            route = quoteRoutes[actionToRoute[action]]
          } else {
            if (path.includes('connections')) {
              route = connectionRoutes.get
              router[method](
                toRouterPath(path),
                createValidatorMiddleware<ContextType<typeof route>>(openApi, {
                  path,
                  method
                }),
                route
              )
            } else if (path !== '/' || method !== HttpMethod.GET) {
              // The payment pointer query route is added last below
              this.logger.warn({ path, method }, 'unexpected path/method')
            }
            continue
          }
          router[method](
            PAYMENT_POINTER_PATH + toRouterPath(path),
            createPaymentPointerMiddleware(),
            createValidatorMiddleware<ContextType<typeof route>>(openApi, {
              path,
              method
            }),
            createAuthMiddleware({
              type,
              action
            }),
            route
          )
        }
      }
    }
    router.get(
      '/keys/{keyId}',
      (ctx: ClientKeysContext): Promise<void> => clientKeysRoutes.get(ctx)
    )

    // Add the payment pointer query route last.
    // Otherwise it will be matched instead of other Open Payments endpoints.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    router.get(
      PAYMENT_POINTER_PATH,
      createPaymentPointerMiddleware(),
      createValidatorMiddleware<PaymentPointerContext>(openApi, {
        path: '/',
        method: HttpMethod.GET
      }),
      async (ctx: PaymentPointerContext): Promise<void> => {
        // Fall back to legacy protocols if client doesn't support Open Payments.
        if (ctx.accepts('application/json')) await paymentPointerRoutes.get(ctx)
        //else if (ctx.accepts('application/ilp-stream+json')) // TODO https://docs.openpayments.dev/accounts#payment-details
        else if (ctx.accepts('application/spsp4+json'))
          await spspRoutes.get(ctx)
        else ctx.throw(406, 'no accepted Content-Type available')
      }
    )

    koa.use(router.routes())

    this.openPaymentsServer = koa.listen(port)
  }

  public async shutdown(): Promise<void> {
    return new Promise((resolve): void => {
      if (this.openPaymentsServer) {
        this.isShuttingDown = true
        this.closeEmitter.emit('shutdown')
        this.adminServer.close((): void => {
          resolve()
        })
        this.openPaymentsServer.close((): void => {
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  public getAdminPort(): number {
    const address = this.adminServer?.address()
    if (address && !(typeof address == 'string')) {
      return address.port
    }
    return 0
  }

  public getOpenPaymentsPort(): number {
    const address = this.openPaymentsServer.address()
    if (address && !(typeof address == 'string')) {
      return address.port
    }
    return 0
  }

  private _isAdmin(ctx: Koa.Context): boolean {
    return ctx.request.header['x-api-key'] == this.config.adminKey
  }

  private async _getSession(ctx: Koa.Context): Promise<Session | undefined> {
    const key = ctx.request.header.authorization || ''
    if (key && key.length) {
      const sessionService = await this.container.use('sessionService')
      return await sessionService.get(key)
    } else {
      return undefined
    }
  }

  private async processPaymentPointer(): Promise<void> {
    const paymentPointerService = await this.container.use(
      'paymentPointerService'
    )
    return paymentPointerService
      .processNext()
      .catch((err) => {
        this.logger.warn({ error: err.message }, 'processPaymentPointer error')
        return true
      })
      .then((hasMoreWork) => {
        if (hasMoreWork) process.nextTick(() => this.processPaymentPointer())
        else
          setTimeout(
            () => this.processPaymentPointer(),
            this.config.paymentPointerWorkerIdle
          ).unref()
      })
  }

  private async processOutgoingPayment(): Promise<void> {
    if (this.isShuttingDown) return
    const outgoingPaymentService = await this.container.use(
      'outgoingPaymentService'
    )
    return outgoingPaymentService
      .processNext()
      .catch((err) => {
        this.logger.warn({ error: err.message }, 'processOutgoingPayment error')
        return true
      })
      .then((hasMoreWork) => {
        if (hasMoreWork) process.nextTick(() => this.processOutgoingPayment())
        else
          setTimeout(
            () => this.processOutgoingPayment(),
            this.config.outgoingPaymentWorkerIdle
          ).unref()
      })
  }

  private async createKoaServer(): Promise<Koa<Koa.DefaultState, AppContext>> {
    const koa = new Koa<DefaultState, AppContext>()

    koa.context.container = this.container
    koa.context.closeEmitter = await this.container.use('closeEmitter')
    koa.context.logger = await this.container.use('logger')

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

  private async processIncomingPayment(): Promise<void> {
    const incomingPaymentService = await this.container.use(
      'incomingPaymentService'
    )
    return incomingPaymentService
      .processNext()
      .catch((err: Error) => {
        this.logger.warn({ error: err.message }, 'processIncomingPayment error')
        return true
      })
      .then((hasMoreWork) => {
        if (hasMoreWork) process.nextTick(() => this.processIncomingPayment())
        else
          setTimeout(
            () => this.processIncomingPayment(),
            this.config.incomingPaymentWorkerIdle
          ).unref()
      })
  }

  private async processWebhook(): Promise<void> {
    const webhookService = await this.container.use('webhookService')
    return webhookService
      .processNext()
      .catch((err) => {
        this.logger.warn({ error: err.message }, 'processWebhook error')
        return true
      })
      .then((hasMoreWork) => {
        if (hasMoreWork) process.nextTick(() => this.processWebhook())
        else
          setTimeout(
            () => this.processWebhook(),
            this.config.webhookWorkerIdle
          ).unref()
      })
  }
}
