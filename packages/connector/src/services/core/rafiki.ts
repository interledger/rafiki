/* eslint-disable @typescript-eslint/no-explicit-any */
import Koa, { Middleware } from 'koa'
import createRouter, { Router as KoaRouter } from 'koa-joi-router'
import { Router } from './services/router'
import {
  createIlpPacketMiddleware,
  ilpAddressToPath,
  IlpPacketMiddlewareOptions,
  RafikiPrepare
} from './middleware/ilp-packet'
import { createPeerMiddleware, PeerMiddlewareOptions } from './middleware/peer'
import { PeersService, Peer } from './services/peers'
import { AuthState } from './middleware/auth'
import {
  createTokenAuthMiddleware,
  TokenAuthConfig
} from './middleware/token-auth'
import { AccountSnapshot, AccountsService } from './services/accounts'
import { LoggingService } from './services/logger'
import { IncomingMessage, ServerResponse } from 'http'
import { IlpReply, IlpReject, IlpFulfill } from 'ilp-packet'
import { DebugLogger } from './services/logger/debug'
import {
  AccountMiddlewareOptions,
  createAccountMiddleware
} from './middleware/account'

export interface RafikiServices {
  router: Router
  peers: PeersService
  accounts: AccountsService
  logger: LoggingService
}

export interface RafikiIlpConfig
  extends IlpPacketMiddlewareOptions,
    PeerMiddlewareOptions,
    AccountMiddlewareOptions {
  path?: string
}
export type RafikiState<T> = T & AuthState

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
  peers: {
    readonly incoming: Promise<Peer>
    readonly outgoing: Promise<Peer>
  }
  accounts: {
    readonly incoming: Promise<AccountSnapshot>
    readonly outgoing: Promise<AccountSnapshot>
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
  private _router?: Router
  private _peers?: PeersService
  private _accounts?: AccountsService
  constructor(config?: Partial<RafikiServices>) {
    super()

    this._router = config && config.router ? config.router : undefined
    this._peers = config && config.peers ? config.peers : undefined
    this._accounts = config && config.accounts ? config.accounts : undefined
    const logger =
      config && config.logger ? config.logger : new DebugLogger('rafiki')
    const peersOrThrow = (): PeersService => {
      if (this._peers) return this._peers
      throw new Error('No peers service provided to the app')
    }
    const accountsOrThrow = (): AccountsService => {
      if (this._accounts) return this._accounts
      throw new Error('No accounts service provided to the app')
    }
    const routerOrThrow = (): Router => {
      if (this._router) return this._router
      throw new Error('No router service provided to the app')
    }

    // Set global context that exposes services
    this.context.services = {
      get peers(): PeersService {
        return peersOrThrow()
      },
      get router(): Router {
        return routerOrThrow()
      },
      get accounts(): AccountsService {
        return accountsOrThrow()
      },
      logger
    }
  }

  public get router(): Router | undefined {
    return this._router
  }

  public set router(router: Router | undefined) {
    this._router = router
  }

  public get peers(): PeersService | undefined {
    return this._peers
  }

  public set peers(peers: PeersService | undefined) {
    this._peers = peers
  }

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

  public useIlp(config?: RafikiIlpConfig): void {
    this.use(createIlpPacketMiddleware())
    this.use(createPeerMiddleware(config))
    this.use(createAccountMiddleware(config))
  }
}

interface RafikiCreateAppServices extends RafikiServices {
  auth: RafikiMiddleware<AuthState> | Partial<TokenAuthConfig>
}

export function createAuthMiddleware(
  auth?: RafikiMiddleware<AuthState> | Partial<TokenAuthConfig>
): RafikiMiddleware {
  if (typeof auth === 'function') {
    return auth
  } else {
    return createTokenAuthMiddleware(auth)
  }
}

export function createApp(
  { auth, peers, accounts, router, logger }: Partial<RafikiCreateAppServices>,
  config?: RafikiIlpConfig
): Rafiki {
  const app = new Rafiki({
    peers,
    router,
    accounts,
    logger
  })

  app.use(createAuthMiddleware(auth))
  app.useIlp(config)

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
