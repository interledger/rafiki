import { join } from 'path'
import http, { Server } from 'http'
import { ParsedUrlQuery } from 'querystring'
import { Client as TigerbeetleClient } from 'tigerbeetle-node'

import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import Koa, { DefaultState } from 'koa'
import bodyParser from 'koa-bodyparser'
import { Logger } from 'pino'
import Router from '@koa/router'
import { ApolloServer } from '@apollo/server'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import { koaMiddleware } from '@as-integrations/koa'

import { IAppConfig } from './config/app'
import { addResolversToSchema } from '@graphql-tools/schema'
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader'
import { loadSchemaSync } from '@graphql-tools/load'

import { resolvers } from './graphql/resolvers'
import { HttpTokenService } from './payment-method/ilp/peer-http-token/service'
import { AssetService, AssetOptions } from './asset/service'
import { AccountingService } from './accounting/service'
import { PeerService } from './payment-method/ilp/peer/service'
import { createWalletAddressMiddleware } from './open_payments/wallet_address/middleware'
import { WalletAddress } from './open_payments/wallet_address/model'
import { WalletAddressService } from './open_payments/wallet_address/service'
import {
  createTokenIntrospectionMiddleware,
  httpsigMiddleware,
  Grant,
  RequestAction,
  authenticatedStatusMiddleware
} from './open_payments/auth/middleware'
import { RatesService } from './rates/service'
import { spspMiddleware } from './payment-method/ilp/spsp/middleware'
import { SPSPRoutes } from './payment-method/ilp/spsp/routes'
import {
  IncomingPaymentRoutes,
  CreateBody as IncomingCreateBody
} from './open_payments/payment/incoming/routes'
import { WalletAddressKeyRoutes } from './open_payments/wallet_address/key/routes'
import { WalletAddressRoutes } from './open_payments/wallet_address/routes'
import { IncomingPaymentService } from './open_payments/payment/incoming/service'
import { StreamServer } from '@interledger/stream-receiver'
import { WebhookService } from './webhook/service'
import {
  QuoteRoutes,
  CreateBody as QuoteCreateBody
} from './open_payments/quote/routes'
import { QuoteService } from './open_payments/quote/service'
import {
  OutgoingPaymentRoutes,
  CreateBody as OutgoingCreateBody
} from './open_payments/payment/outgoing/routes'
import { OutgoingPaymentService } from './open_payments/payment/outgoing/service'
import { IlpPlugin, IlpPluginOptions } from './payment-method/ilp/ilp_plugin'
import { createValidatorMiddleware, HttpMethod } from '@interledger/openapi'
import { WalletAddressKeyService } from './open_payments/wallet_address/key/service'
import {
  AccessAction,
  AccessType,
  AuthenticatedClient,
  PaginationArgs
} from '@interledger/open-payments'
import { RemoteIncomingPaymentService } from './open_payments/payment/incoming_remote/service'
import { ReceiverService } from './open_payments/receiver/service'
import { Client as TokenIntrospectionClient } from 'token-introspection'
import { applyMiddleware } from 'graphql-middleware'
import { Redis } from 'ioredis'
import {
  idempotencyGraphQLMiddleware,
  lockGraphQLMutationMiddleware
} from './graphql/middleware'
import { createRedisDataStore } from './middleware/cache/data-stores/redis'
import { createRedisLock } from './middleware/lock/redis'
import { CombinedPaymentService } from './open_payments/payment/combined/service'
import { FeeService } from './fee/service'
import { AutoPeeringService } from './payment-method/ilp/auto-peering/service'
import { AutoPeeringRoutes } from './payment-method/ilp/auto-peering/routes'
import { Rafiki as ConnectorApp } from './payment-method/ilp/connector/core'
import { AxiosInstance } from 'axios'
import { PaymentMethodHandlerService } from './payment-method/handler/service'
import { IlpPaymentService } from './payment-method/ilp/service'

export interface AppContextData {
  logger: Logger
  container: AppContainer
  // Set by @koa/router.
  params: { [key: string]: string }
  walletAddress?: WalletAddress
  walletAddressUrl?: string
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

export interface WalletAddressContext extends AppContext {
  walletAddress: WalletAddress
  grant?: Grant
  client?: string
  accessAction?: AccessAction
}

export type WalletAddressKeysContext = Omit<
  WalletAddressContext,
  'walletAddress'
> & {
  walletAddress?: WalletAddress
}

type HttpSigHeaders = Record<'signature' | 'signature-input', string>

type HttpSigRequest = Omit<AppContext['request'], 'headers'> & {
  headers: HttpSigHeaders
}

export type HttpSigContext = AppContext & {
  request: HttpSigRequest
  headers: HttpSigHeaders
  client: string
}

export type HttpSigWithAuthenticatedStatusContext = HttpSigContext &
  AuthenticatedStatusContext

// Wallet address subresources
interface GetCollectionQuery {
  'wallet-address': string
}

type CollectionRequest<BodyT = never, QueryT = ParsedUrlQuery> = Omit<
  WalletAddressContext['request'],
  'body'
> & {
  body: BodyT
  query: ParsedUrlQuery & QueryT
}

type CollectionContext<BodyT = never, QueryT = ParsedUrlQuery> = Omit<
  WalletAddressContext,
  'request' | 'client' | 'accessAction'
> & {
  request: CollectionRequest<BodyT, QueryT>
  client: NonNullable<WalletAddressContext['client']>
  accessAction: NonNullable<WalletAddressContext['accessAction']>
}

type SignedCollectionContext<
  BodyT = never,
  QueryT = ParsedUrlQuery
> = CollectionContext<BodyT, QueryT> & HttpSigContext

type SubresourceRequest = Omit<AppContext['request'], 'params'> & {
  params: Record<'id', string>
}

type SubresourceContext = Omit<
  WalletAddressContext,
  'request' | 'grant' | 'client' | 'accessAction'
> & {
  request: SubresourceRequest
  client: NonNullable<WalletAddressContext['client']>
  accessAction: NonNullable<WalletAddressContext['accessAction']>
}

export type AuthenticatedStatusContext = { authenticated: boolean }

type SignedSubresourceContext = SubresourceContext & HttpSigContext

type SubresourceContextWithAuthenticatedStatus = SubresourceContext &
  HttpSigContext &
  AuthenticatedStatusContext

export type CreateContext<BodyT> = CollectionContext<BodyT>
export type ReadContext = SubresourceContext
export type CompleteContext = SubresourceContext
export type ListContext = CollectionContext<never, PaginationArgs>

export interface SPSPContext extends AppContext {
  paymentTag: string
  asset: AssetOptions
}

type ContextType<T> = T extends (
  ctx: infer Context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => any
  ? Context
  : never

const WALLET_ADDRESS_PATH = '/:walletAddressPath+'

export interface AppServices {
  logger: Promise<Logger>
  knex: Promise<Knex>
  axios: Promise<AxiosInstance>
  config: Promise<IAppConfig>
  httpTokenService: Promise<HttpTokenService>
  assetService: Promise<AssetService>
  accountingService: Promise<AccountingService>
  peerService: Promise<PeerService>
  walletAddressService: Promise<WalletAddressService>
  spspRoutes: Promise<SPSPRoutes>
  incomingPaymentRoutes: Promise<IncomingPaymentRoutes>
  outgoingPaymentRoutes: Promise<OutgoingPaymentRoutes>
  quoteRoutes: Promise<QuoteRoutes>
  walletAddressKeyRoutes: Promise<WalletAddressKeyRoutes>
  walletAddressRoutes: Promise<WalletAddressRoutes>
  incomingPaymentService: Promise<IncomingPaymentService>
  remoteIncomingPaymentService: Promise<RemoteIncomingPaymentService>
  receiverService: Promise<ReceiverService>
  streamServer: Promise<StreamServer>
  webhookService: Promise<WebhookService>
  quoteService: Promise<QuoteService>
  outgoingPaymentService: Promise<OutgoingPaymentService>
  makeIlpPlugin: Promise<(options: IlpPluginOptions) => IlpPlugin>
  ratesService: Promise<RatesService>
  walletAddressKeyService: Promise<WalletAddressKeyService>
  openPaymentsClient: Promise<AuthenticatedClient>
  tokenIntrospectionClient: Promise<TokenIntrospectionClient>
  redis: Promise<Redis>
  combinedPaymentService: Promise<CombinedPaymentService>
  feeService: Promise<FeeService>
  autoPeeringService: Promise<AutoPeeringService>
  autoPeeringRoutes: Promise<AutoPeeringRoutes>
  connectorApp: Promise<ConnectorApp>
  tigerbeetle: Promise<TigerbeetleClient>
  paymentMethodHandlerService: Promise<PaymentMethodHandlerService>
  ilpPaymentService: Promise<IlpPaymentService>
}

export type AppContainer = IocContract<AppServices>

export class App {
  private openPaymentsServer!: Server
  private ilpConnectorService!: Server
  private adminServer!: Server
  private autoPeeringServer!: Server
  public apolloServer!: ApolloServer
  public isShuttingDown = false
  private logger!: Logger
  private config!: IAppConfig

  public constructor(private container: IocContract<AppServices>) {}

  /**
   * The boot function exists because the functions that we register on the container with the `bind` method are async.
   * We then need to await this function when we call use - which can't be done in the constructor. This is a first pass to
   * get the container working. We can refactor this in future. Perhaps don't use private members and just pass around the container?
   * Or provide start / shutdown methods on the services in the container?
   */
  public async boot(): Promise<void> {
    this.config = await this.container.use('config')
    this.logger = await this.container.use('logger')

    // Workers are in the way during tests.
    if (this.config.env !== 'test') {
      for (let i = 0; i < this.config.walletAddressWorkers; i++) {
        process.nextTick(() => this.processWalletAddress())
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

  public async startAdminServer(port: number): Promise<void> {
    const koa = await this.createKoaServer()
    const httpServer = http.createServer(koa.callback())

    // Load schema from the file
    const schema = loadSchemaSync(join(__dirname, './graphql/schema.graphql'), {
      loaders: [new GraphQLFileLoader()]
    })

    const redis = await this.container.use('redis')

    // Add resolvers to the schema
    const schemaWithMiddleware = applyMiddleware(
      addResolversToSchema({
        schema,
        resolvers
      }),
      lockGraphQLMutationMiddleware(
        createRedisLock({
          redisClient: redis,
          keyTtlMs: this.config.graphQLIdempotencyKeyLockMs
        })
      ),
      idempotencyGraphQLMiddleware(
        createRedisDataStore(redis, this.config.graphQLIdempotencyKeyTtlMs)
      )
    )

    // Setup Apollo
    this.apolloServer = new ApolloServer({
      schema: schemaWithMiddleware,
      plugins: [ApolloServerPluginDrainHttpServer({ httpServer })]
    })

    await this.apolloServer.start()

    koa.use(bodyParser())

    koa.use(
      async (
        ctx: {
          path: string
          status: number
        },
        next: Koa.Next
      ): Promise<void> => {
        if (ctx.path !== '/graphql') {
          ctx.status = 404
        } else {
          return next()
        }
      }
    )

    koa.use(
      koaMiddleware(this.apolloServer, {
        context: async (): Promise<ApolloContext> => {
          return {
            container: this.container,
            logger: await this.container.use('logger')
          }
        }
      })
    )

    this.adminServer = httpServer.listen(port)
  }

  public async startOpenPaymentsServer(port: number): Promise<void> {
    const koa = await this.createKoaServer()

    const router = new Router<DefaultState, AppContext>()
    router.use(bodyParser())
    router.get('/healthz', (ctx: AppContext): void => {
      ctx.status = 200
    })

    const walletAddressKeyRoutes = await this.container.use(
      'walletAddressKeyRoutes'
    )
    const walletAddressRoutes = await this.container.use('walletAddressRoutes')
    const incomingPaymentRoutes = await this.container.use(
      'incomingPaymentRoutes'
    )
    const outgoingPaymentRoutes = await this.container.use(
      'outgoingPaymentRoutes'
    )
    const quoteRoutes = await this.container.use('quoteRoutes')
    const { resourceServerSpec } = await this.container.use('openApi')

    // POST /incoming-payments
    // Create incoming payment
    router.post<DefaultState, SignedCollectionContext<IncomingCreateBody>>(
      '/incoming-payments',
      createWalletAddressMiddleware(),
      createValidatorMiddleware<
        ContextType<SignedCollectionContext<IncomingCreateBody>>
      >(resourceServerSpec, {
        path: '/incoming-payments',
        method: HttpMethod.POST
      }),
      createTokenIntrospectionMiddleware({
        requestType: AccessType.IncomingPayment,
        requestAction: RequestAction.Create
      }),
      httpsigMiddleware,
      incomingPaymentRoutes.create
    )

    // GET /incoming-payments
    // List incoming payments
    router.get<
      DefaultState,
      SignedCollectionContext<never, GetCollectionQuery>
    >(
      '/incoming-payments',
      createWalletAddressMiddleware(),
      createValidatorMiddleware<
        ContextType<SignedCollectionContext<never, GetCollectionQuery>>
      >(resourceServerSpec, {
        path: '/incoming-payments',
        method: HttpMethod.GET
      }),
      createTokenIntrospectionMiddleware({
        requestType: AccessType.IncomingPayment,
        requestAction: RequestAction.List
      }),
      httpsigMiddleware,
      incomingPaymentRoutes.list
    )

    // POST /outgoing-payment
    // Create outgoing payment
    router.post<DefaultState, SignedCollectionContext<OutgoingCreateBody>>(
      '/outgoing-payments',
      createWalletAddressMiddleware(),
      createValidatorMiddleware<
        ContextType<SignedCollectionContext<OutgoingCreateBody>>
      >(resourceServerSpec, {
        path: '/outgoing-payments',
        method: HttpMethod.POST
      }),
      createTokenIntrospectionMiddleware({
        requestType: AccessType.OutgoingPayment,
        requestAction: RequestAction.Create
      }),
      httpsigMiddleware,
      outgoingPaymentRoutes.create
    )

    // GET /outgoing-payment
    // List outgoing payments
    router.get<
      DefaultState,
      SignedCollectionContext<never, GetCollectionQuery>
    >(
      '/outgoing-payments',
      createWalletAddressMiddleware(),
      createValidatorMiddleware<
        ContextType<SignedCollectionContext<never, GetCollectionQuery>>
      >(resourceServerSpec, {
        path: '/outgoing-payments',
        method: HttpMethod.GET
      }),
      createTokenIntrospectionMiddleware({
        requestType: AccessType.OutgoingPayment,
        requestAction: RequestAction.List
      }),
      httpsigMiddleware,
      outgoingPaymentRoutes.list
    )

    // POST /quotes
    // Create quote
    router.post<DefaultState, SignedCollectionContext<QuoteCreateBody>>(
      '/quotes',
      createWalletAddressMiddleware(),
      createValidatorMiddleware<
        ContextType<SignedCollectionContext<QuoteCreateBody>>
      >(resourceServerSpec, {
        path: '/quotes',
        method: HttpMethod.POST
      }),
      createTokenIntrospectionMiddleware({
        requestType: AccessType.Quote,
        requestAction: RequestAction.Create
      }),
      httpsigMiddleware,
      quoteRoutes.create
    )

    // GET /incoming-payments/{id}
    // Read incoming payment
    router.get<DefaultState, SubresourceContextWithAuthenticatedStatus>(
      '/incoming-payments/:id',
      createWalletAddressMiddleware(),
      createValidatorMiddleware<
        ContextType<SubresourceContextWithAuthenticatedStatus>
      >(resourceServerSpec, {
        path: '/incoming-payments/{id}',
        method: HttpMethod.GET
      }),
      createTokenIntrospectionMiddleware({
        requestType: AccessType.IncomingPayment,
        requestAction: RequestAction.Read,
        bypassError: true
      }),
      authenticatedStatusMiddleware,
      incomingPaymentRoutes.get
    )

    // POST /incoming-payments/{id}/complete
    // Complete incoming payment
    router.post<DefaultState, SignedSubresourceContext>(
      '/incoming-payments/:id/complete',
      createWalletAddressMiddleware(),
      createValidatorMiddleware<ContextType<SignedSubresourceContext>>(
        resourceServerSpec,
        {
          path: '/incoming-payments/{id}/complete',
          method: HttpMethod.POST
        }
      ),
      createTokenIntrospectionMiddleware({
        requestType: AccessType.IncomingPayment,
        requestAction: RequestAction.Complete
      }),
      httpsigMiddleware,
      incomingPaymentRoutes.complete
    )

    // GET /outgoing-payments/{id}
    // Read outgoing payment
    router.get<DefaultState, SignedSubresourceContext>(
      '/outgoing-payments/:id',
      createWalletAddressMiddleware(),
      createValidatorMiddleware<ContextType<SignedSubresourceContext>>(
        resourceServerSpec,
        {
          path: '/outgoing-payments/{id}',
          method: HttpMethod.GET
        }
      ),
      createTokenIntrospectionMiddleware({
        requestType: AccessType.OutgoingPayment,
        requestAction: RequestAction.Read
      }),
      httpsigMiddleware,
      outgoingPaymentRoutes.get
    )

    // GET /quotes/{id}
    // Read quote
    router.get<DefaultState, SignedSubresourceContext>(
      '/quotes/:id',
      createWalletAddressMiddleware(),
      createValidatorMiddleware<ContextType<SignedSubresourceContext>>(
        resourceServerSpec,
        {
          path: '/quotes/{id}',
          method: HttpMethod.GET
        }
      ),
      createTokenIntrospectionMiddleware({
        requestType: AccessType.Quote,
        requestAction: RequestAction.Read
      }),
      httpsigMiddleware,
      quoteRoutes.get
    )

    router.get(
      WALLET_ADDRESS_PATH + '/jwks.json',
      createWalletAddressMiddleware(),
      createValidatorMiddleware<WalletAddressKeysContext>(resourceServerSpec, {
        path: '/jwks.json',
        method: HttpMethod.GET
      }),
      async (ctx: WalletAddressKeysContext): Promise<void> =>
        await walletAddressKeyRoutes.getKeysByWalletAddressId(ctx)
    )

    // Add the wallet address query route last.
    // Otherwise it will be matched instead of other Open Payments endpoints.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    router.get(
      WALLET_ADDRESS_PATH,
      createWalletAddressMiddleware(),
      spspMiddleware,
      createValidatorMiddleware<WalletAddressContext>(resourceServerSpec, {
        path: '/',
        method: HttpMethod.GET
      }),
      walletAddressRoutes.get
    )

    koa.use(router.routes())

    this.openPaymentsServer = koa.listen(port)
  }

  public async startAutoPeeringServer(port: number): Promise<void> {
    const koa = await this.createKoaServer()

    const autoPeeringRoutes = await this.container.use('autoPeeringRoutes')
    const router = new Router<DefaultState, AppContext>()

    router.use(bodyParser())
    router.post('/', autoPeeringRoutes.acceptPeerRequest)

    koa.use(router.routes())

    this.autoPeeringServer = koa.listen(port)
  }

  public async startIlpConnectorServer(port: number): Promise<void> {
    const ilpConnectorService = await this.container.use('connectorApp')
    this.ilpConnectorService = ilpConnectorService.listenPublic(port)
  }

  public async shutdown(): Promise<void> {
    this.isShuttingDown = true

    if (this.openPaymentsServer) {
      await this.stopServer(this.openPaymentsServer)
    }
    if (this.adminServer) {
      await this.stopServer(this.adminServer)
    }
    if (this.ilpConnectorService) {
      await this.stopServer(this.ilpConnectorService)
    }
    if (this.autoPeeringServer) {
      await this.stopServer(this.autoPeeringServer)
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

  private async processWalletAddress(): Promise<void> {
    const walletAddressService = await this.container.use(
      'walletAddressService'
    )
    return walletAddressService
      .processNext()
      .catch((err) => {
        this.logger.warn({ error: err.message }, 'processWalletAddress error')
        return true
      })
      .then((hasMoreWork) => {
        if (hasMoreWork) process.nextTick(() => this.processWalletAddress())
        else
          setTimeout(
            () => this.processWalletAddress(),
            this.config.walletAddressWorkerIdle
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
    const koa = new Koa<DefaultState, AppContext>({
      proxy: this.config.trustProxy
    })

    koa.context.container = this.container
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
