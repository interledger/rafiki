import * as http from 'http'
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
import {
  createTokenAuthMiddleware,
  createAdminAuthMiddleware
} from './middleware'
import { LoggingService } from './services/logger'
import { IncomingMessage, ServerResponse } from 'http'
import { IlpReply, IlpReject, IlpFulfill } from 'ilp-packet'
import { DebugLogger } from './services/logger/debug'
import { RatesService } from '../../rates/service'
import { createAccountMiddleware } from './middleware/account'
import { createStreamAddressMiddleware } from './middleware/stream-address'
import { AccountTransfer } from '../../account/service'
import { AccountTransferError } from '../../account/errors'

export interface RafikiAccount {
  id: string
  disabled: boolean
  asset: {
    code: string
    scale: number
  }
  http?: {
    outgoing: {
      authToken: string
      endpoint: string
    }
  }
  stream: {
    enabled: boolean
  }
  routing?: {
    staticIlpAddress: string
  }
  maxPacketAmount?: bigint
}

export interface TransferOptions {
  sourceAccount: RafikiAccount
  destinationAccount: RafikiAccount
  sourceAmount: bigint
  destinationAmount?: bigint
  timeout: bigint // nano-seconds
}

export interface AccountService {
  get(id: string): Promise<RafikiAccount | undefined>
  getByDestinationAddress(
    destinationAddress: string
  ): Promise<RafikiAccount | undefined>
  getByToken(token: string): Promise<RafikiAccount | undefined>
  getAddress(id: string): Promise<string | undefined>
  transferFunds(
    options: TransferOptions
  ): Promise<AccountTransfer | AccountTransferError>
}

export interface RafikiServices {
  //router: Router
  accounts: AccountService
  logger: LoggingService
  rates: RatesService
  redis: Redis
  streamServer: StreamServer
}

export type RafikiConfig = Partial<RafikiServices> & {
  rates: RatesService
  redis: Redis
  streamServer: StreamServer
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
    readonly incoming: RafikiAccount
    readonly outgoing: RafikiAccount
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

export class Rafiki<T = any> {
  //private _router?: Router
  private _accounts?: AccountService
  private streamServer: StreamServer
  private redis: Redis

  private publicServer: Koa<T, RafikiContextMixin> = new Koa()
  private adminServer: Koa<T, RafikiContextMixin> = new Koa()

  constructor(config: RafikiConfig) {
    //this._router = config && config.router ? config.router : undefined
    this.redis = config.redis
    this._accounts = config && config.accounts ? config.accounts : undefined
    const logger =
      config && config.logger ? config.logger : new DebugLogger('rafiki')
    const accountsOrThrow = (): AccountService => {
      if (this._accounts) return this._accounts
      throw new Error('No accounts service provided to the app')
    }
    //const routerOrThrow = (): Router => {
    //  if (this._router) return this._router
    //  throw new Error('No router service provided to the app')
    //}

    this.streamServer = config.streamServer
    const { redis, streamServer } = this
    // Set global context that exposes services
    this.publicServer.context.services = this.adminServer.context.services = {
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
      get accounts(): AccountService {
        return accountsOrThrow()
      },
      logger
    }
    this._useIlp()
  }

  //public get router(): Router | undefined {
  //  return this._router
  //}

  //public set router(router: Router | undefined) {
  //  this._router = router
  //}

  public get accounts(): AccountService | undefined {
    return this._accounts
  }

  public set accounts(accounts: AccountService | undefined) {
    this._accounts = accounts
  }

  public get logger(): LoggingService {
    return this.publicServer.context.services.logger
  }

  public set logger(logger: LoggingService) {
    this.publicServer.context.services.logger = this.adminServer.context.services.logger = logger
  }

  public _useIlp(): void {
    this.publicServer.use(createTokenAuthMiddleware())
    this.adminServer.use(createAdminAuthMiddleware())
    this.use(createIlpPacketMiddleware())
    this.use(createStreamAddressMiddleware())
    this.use(createAccountMiddleware())
  }

  public use(middleware: Koa.Middleware<T, RafikiContextMixin>): void {
    this.adminServer.use(middleware)
    this.publicServer.use(middleware)
  }

  public listenPublic(port: number): http.Server {
    return this.publicServer.listen(port)
  }

  public listenAdmin(port: number): http.Server {
    return this.adminServer.listen(port)
  }
}

export function createApp(config: RafikiConfig): Rafiki {
  return new Rafiki(config)
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
