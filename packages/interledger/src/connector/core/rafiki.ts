/* eslint-disable @typescript-eslint/no-explicit-any */
import Koa, { Middleware } from 'koa'
import createRouter, { Router as KoaRouter } from 'koa-joi-router'
import { Redis } from 'ioredis'
import { StreamServer } from '@interledger/stream-receiver'
//import { Router } from './services/router'
import {
  createIlpPacketMiddleware,
  ilpAddressToPath,
  RafikiPrepare
} from './middleware/ilp-packet'
import { createTokenAuthMiddleware } from './middleware/token-auth'
import { LoggingService } from './services/logger'
import {
  ConnectorAccountsService as AccountsService,
  IlpAccount
} from 'accounts'
import { IncomingMessage, ServerResponse } from 'http'
import { IlpReply, IlpReject, IlpFulfill } from 'ilp-packet'
import { DebugLogger } from './services/logger/debug'
import { RatesService } from './services/rates/service'
import { createAccountMiddleware } from './middleware/account'
import { createStreamAddressMiddleware } from './middleware/stream-address'

export interface RafikiServices {
  //router: Router
  accounts: AccountsService
  logger: LoggingService
  rates: RatesService
  redis: Redis
  streamServer: StreamServer
}

export type RafikiConfig = Partial<RafikiServices> & {
  rates: RatesService
  redis: Redis
  stream: {
    serverSecret: Buffer
    serverAddress: string
  }
}

export type RafikiRequestMixin = {
  prepare: RafikiPrepare
  rawPrepare: Buffer
}
export type RafikiResponseMixin = {
  reject?: IlpReject
  rawReject?: Buffer
  fulfill?: IlpFulfill
  rawFulfill?: Buffer
  reply?: IlpReply
  rawReply?: Buffer
}

export type RafikiRequest = Koa.Request & RafikiRequestMixin
export type RafikiResponse = Koa.Response & RafikiResponseMixin

export type RafikiContextMixin = {
  services: RafikiServices
  accounts: {
    readonly incoming: IlpAccount
    readonly outgoing: IlpAccount
  }
  request: RafikiRequest
  response: RafikiResponse
  req: IncomingMessage & RafikiRequestMixin
  res: ServerResponse & RafikiResponseMixin
}

export type RafikiContext<T = any> = Koa.ParameterizedContext<
  T,
  RafikiContextMixin
>
export type RafikiMiddleware<T = any> = Middleware<T, RafikiContextMixin>

export class Rafiki<T = any> extends Koa<T, RafikiContextMixin> {
  //private _router?: Router
  private _accounts?: AccountsService
  private streamServer: StreamServer
  private redis: Redis
  constructor(config: RafikiConfig) {
    super()

    //this._router = config && config.router ? config.router : undefined
    this.redis = config.redis
    this._accounts = config && config.accounts ? config.accounts : undefined
    const logger =
      config && config.logger ? config.logger : new DebugLogger('rafiki')
    const accountsOrThrow = (): AccountsService => {
      if (this._accounts) return this._accounts
      throw new Error('No accounts service provided to the app')
    }
    //const routerOrThrow = (): Router => {
    //  if (this._router) return this._router
    //  throw new Error('No router service provided to the app')
    //}

    this.streamServer = new StreamServer(config.stream)
    const { redis, streamServer } = this
    // Set global context that exposes services
    this.context.services = {
      //get router(): Router {
      //  return routerOrThrow()
      //},
      get rates(): RatesService {
        return config.rates
      },
      get redis(): Redis {
        return redis
      },
      get streamServer(): StreamServer {
        return streamServer
      },
      get accounts(): AccountsService {
        return accountsOrThrow()
      },
      logger
    }
  }

  //public get router(): Router | undefined {
  //  return this._router
  //}

  //public set router(router: Router | undefined) {
  //  this._router = router
  //}

  public get accounts(): AccountsService | undefined {
    return this._accounts
  }

  public set accounts(accounts: AccountsService | undefined) {
    this._accounts = accounts
  }

  public get logger(): LoggingService {
    return this.context.services.logger
  }

  public set logger(logger: LoggingService) {
    this.context.services.logger = logger
  }

  public useIlp(): void {
    this.use(createIlpPacketMiddleware())
    this.use(createStreamAddressMiddleware())
    this.use(createAccountMiddleware())
  }
}

export function createApp(config: RafikiConfig): Rafiki {
  const app = new Rafiki(config)

  app.use(createTokenAuthMiddleware())
  app.useIlp()

  return app
}

// TODO the joi-koa-middleware needs to be replaced by @koa/router. But the type defs are funky and require work
export class RafikiRouter {
  private _router: KoaRouter

  constructor() {
    this._router = createRouter()
  }

  public ilpRoute(
    ilpAddressPattern: string,
    handler: RafikiMiddleware<any>
  ): void {
    const path =
      '/' +
      ilpAddressToPath(ilpAddressPattern)
        .split('/')
        .filter(Boolean)
        .join('/') // Trim trailing slash
        .replace('*', '(.*)') // Replace wildcard with regex that only matches valid address chars

    // "as any" because of tangled types.
    this._router.post(path, handler as any)
  }

  public routes(): RafikiMiddleware<any> {
    return this._router.middleware()
  }
}
