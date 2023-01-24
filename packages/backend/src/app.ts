import { join } from 'path'
import { Server } from 'http'
import { EventEmitter } from 'events'
import { ParsedUrlQuery } from 'querystring'

import { IocContract } from '@adonisjs/fold'
import { JWK } from 'http-signature-utils'
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
import {
  createTokenIntrospectionMiddleware,
  httpsigMiddleware,
  Grant,
  RequestAction
} from './open_payments/auth/middleware'
import { RatesService } from './rates/service'
import { SPSPRoutes } from './spsp/routes'
import { IncomingPaymentRoutes } from './open_payments/payment/incoming/routes'
import { PaymentPointerKeyRoutes } from './open_payments/payment_pointer/key/routes'
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
import { createValidatorMiddleware, HttpMethod, isHttpMethod } from 'openapi'
import { PaymentPointerKeyService } from './open_payments/payment_pointer/key/service'
import { AccessType, AuthenticatedClient } from 'open-payments'
import { RemoteIncomingPaymentService } from './open_payments/payment/incoming_remote/service'
import { ReceiverService } from './open_payments/receiver/service'
import { Client as TokenIntrospectionClient } from 'token-introspection'

export interface AppContextData {
  logger: Logger
  closeEmitter: EventEmitter
  container: AppContainer
  // Set by @koa/router.
  params: { [key: string]: string }
  paymentPointer?: PaymentPointer
  paymentPointerUrl?: string
}

export interface ApolloContext {
  container: IocContract<AppServices>
  logger: Logger
}
export type AppContext = Koa.ParameterizedContext<DefaultState, AppContextData>

export type AppRequest<ParamsT extends string = string> = Omit<
  AppContext['request'],
  'params'
> & {
  params: Record<ParamsT, string>
}

export interface PaymentPointerContext extends AppContext {
  paymentPointer: PaymentPointer
  grant?: Grant
  clientId?: string
  clientKey?: JWK
}

export type PaymentPointerKeysContext = Omit<
  PaymentPointerContext,
  'paymentPointer'
> & {
  paymentPointer?: PaymentPointer
}

type HttpSigHeaders = Record<'signature' | 'signature-input', string>

type HttpSigRequest = Omit<AppContext['request'], 'headers'> & {
  headers: HttpSigHeaders
}

export type HttpSigContext = AppContext & {
  request: HttpSigRequest
  headers: HttpSigHeaders
  grant: Grant
  clientKey: JWK
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
  paymentPointerService: Promise<PaymentPointerService>
  spspRoutes: Promise<SPSPRoutes>
  incomingPaymentRoutes: Promise<IncomingPaymentRoutes>
  outgoingPaymentRoutes: Promise<OutgoingPaymentRoutes>
  quoteRoutes: Promise<QuoteRoutes>
  paymentPointerKeyRoutes: Promise<PaymentPointerKeyRoutes>
  paymentPointerRoutes: Promise<PaymentPointerRoutes>
  incomingPaymentService: Promise<IncomingPaymentService>
  remoteIncomingPaymentService: Promise<RemoteIncomingPaymentService>
  receiverService: Promise<ReceiverService>
  streamServer: Promise<StreamServer>
  webhookService: Promise<WebhookService>
  quoteService: Promise<QuoteService>
  outgoingPaymentService: Promise<OutgoingPaymentService>
  makeIlpPlugin: Promise<(options: IlpPluginOptions) => IlpPlugin>
  ratesService: Promise<RatesService>
  paymentPointerKeyService: Promise<PaymentPointerKeyService>
  openPaymentsClient: Promise<AuthenticatedClient>
  tokenIntrospectionClient: Promise<TokenIntrospectionClient>
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

    // Setup Apollo on graphql endpoint
    this.apolloServer = new ApolloServer({
      schema: schemaWithResolvers,
      context: async (): Promise<ApolloContext> => {
        return {
          container: this.container,
          logger: await this.container.use('logger')
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
    const paymentPointerKeyRoutes = await this.container.use(
      'paymentPointerKeyRoutes'
    )
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
    const { resourceServerSpec } = await this.container.use('openApi')
    const toRouterPath = (path: string): string =>
      path.replace(/{/g, ':').replace(/}/g, '')

    const toAction = ({
      path,
      method
    }: {
      path: string
      method: HttpMethod
    }): RequestAction | undefined => {
      switch (method) {
        case HttpMethod.GET:
          return path.endsWith('{id}') ? RequestAction.Read : RequestAction.List
        case HttpMethod.POST:
          return path.endsWith('/complete')
            ? RequestAction.Complete
            : RequestAction.Create
        default:
          return undefined
      }
    }

    const actionToRoute: {
      [key in RequestAction]: string
    } = {
      create: 'create',
      read: 'get',
      complete: 'complete',
      list: 'list'
    }

    for (const path in resourceServerSpec.paths) {
      for (const method in resourceServerSpec.paths[path]) {
        if (isHttpMethod(method)) {
          const requestAction = toAction({ path, method })
          if (!requestAction) {
            throw new Error()
          }

          let requestType: AccessType
          let route: (ctx: AppContext) => Promise<void>
          if (path.includes('incoming-payments')) {
            requestType = AccessType.IncomingPayment
            route = incomingPaymentRoutes[actionToRoute[requestAction]]
          } else if (path.includes('outgoing-payments')) {
            requestType = AccessType.OutgoingPayment
            route = outgoingPaymentRoutes[actionToRoute[requestAction]]
          } else if (path.includes('quotes')) {
            requestType = AccessType.Quote
            route = quoteRoutes[actionToRoute[requestAction]]
          } else {
            if (path.includes('connections')) {
              route = connectionRoutes.get
              router[method](
                toRouterPath(path),
                createValidatorMiddleware<ContextType<typeof route>>(
                  resourceServerSpec,
                  {
                    path,
                    method
                  }
                ),
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
            createValidatorMiddleware<ContextType<typeof route>>(
              resourceServerSpec,
              {
                path,
                method
              }
            ),
            createTokenIntrospectionMiddleware({
              requestType,
              requestAction
            }),
            httpsigMiddleware,
            route
          )
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    router.get(
      PAYMENT_POINTER_PATH + '/jwks.json',
      createPaymentPointerMiddleware(),
      createValidatorMiddleware<PaymentPointerContext>(resourceServerSpec, {
        path: '/jwks.json',
        method: HttpMethod.GET
      }),
      async (ctx: PaymentPointerContext): Promise<void> =>
        await paymentPointerKeyRoutes.getKeysByPaymentPointerId(ctx)
    )

    // Add the payment pointer query route last.
    // Otherwise it will be matched instead of other Open Payments endpoints.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    router.get(
      PAYMENT_POINTER_PATH,
      createPaymentPointerMiddleware(),
      createValidatorMiddleware<PaymentPointerContext>(resourceServerSpec, {
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
