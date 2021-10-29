import * as http from 'http'
/* eslint-disable @typescript-eslint/no-explicit-any */
import Koa, { Middleware } from 'koa'
import { Redis } from 'ioredis'
import { Logger } from 'pino'
import { Errors } from 'ilp-packet'
import { StreamServer } from '@interledger/stream-receiver'
//import { Router } from './services/router'
import {
  createIlpPacketMiddleware,
  ZeroCopyIlpPrepare,
  IlpResponse
} from './middleware/ilp-packet'
import { createTokenAuthMiddleware } from './middleware'
import { RatesService } from '../../rates/service'
import { AccountTransfer } from '../../account/service'
import { AccountTransferError } from '../../account/errors'
import { PeerService } from '../../peer/service'

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
  getByToken(token: string): Promise<RafikiAccount | undefined>
  transferFunds(
    options: TransferOptions
  ): Promise<AccountTransfer | AccountTransferError>
}

export interface RafikiServices {
  //router: Router
  accounts: AccountService
  logger: Logger
  peers: PeerService
  rates: RatesService
  redis: Redis
  streamServer: StreamServer
}

export type HttpContextMixin = {
  services: RafikiServices
  accounts: {
    readonly incoming: RafikiAccount
    readonly outgoing: RafikiAccount
  }
}

export type HttpContext<T = any> = Koa.ParameterizedContext<T, HttpContextMixin>
export type HttpMiddleware<T = any> = Middleware<T, HttpContextMixin>

export type ILPMiddleware<T = any> = (
  ctx: ILPContext<T>,
  next: () => Promise<void>
) => Promise<void>

export type ILPContext<T = any> = {
  services: RafikiServices
  accounts: {
    readonly incoming: RafikiAccount
    readonly outgoing: RafikiAccount
  }
  request: {
    prepare: ZeroCopyIlpPrepare
    rawPrepare: Buffer
  }
  response: IlpResponse
  throw: (status: number, msg: string) => never
  state: T
}

export class Rafiki<T = any> {
  //private _router?: Router
  private streamServer: StreamServer
  private redis: Redis

  private publicServer: Koa<T, HttpContextMixin> = new Koa()

  constructor(
    private config: RafikiServices,
    private routes: ILPMiddleware<any>
  ) {
    //this._router = config && config.router ? config.router : undefined
    this.redis = config.redis
    const logger = config.logger
    //const routerOrThrow = (): Router => {
    //  if (this._router) return this._router
    //  throw new Error('No router service provided to the app')
    //}

    this.streamServer = config.streamServer
    const { redis, streamServer } = this
    // Set global context that exposes services
    this.publicServer.context.services = {
      //get router(): Router {
      //  return routerOrThrow()
      //},
      get peers(): PeerService {
        return config.peers
      },
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
        return config.accounts
      },
      logger
    }

    this.publicServer.use(createTokenAuthMiddleware())
    this.publicServer.use(createIlpPacketMiddleware(routes))
  }

  async handleIlpData(
    sourceAccountId: string,
    rawPrepare: Buffer
  ): Promise<Buffer> {
    const prepare = new ZeroCopyIlpPrepare(rawPrepare)
    const response = new IlpResponse()
    const account = await this.config.accounts.get(sourceAccountId)
    await this.routes(
      {
        request: { prepare, rawPrepare },
        response,
        services: this.publicServer.context.services,
        accounts: {
          // These are populated up by the accounts middleware.
          get incoming(): RafikiAccount {
            throw new Error('incoming account not available')
          },
          get outgoing(): RafikiAccount {
            throw new Error('outgoing account not available')
          }
        },
        state: { account },
        throw: (_status: number, msg: string): never => {
          throw new Errors.BadRequestError(msg)
        }
      },
      async () => {
        // unreachable, this is the end of the middleware chain
      }
    )
    if (!response.rawReply) throw new Error('error generating reply')
    return response.rawReply
  }

  //public get router(): Router | undefined {
  //  return this._router
  //}

  //public set router(router: Router | undefined) {
  //  this._router = router
  //}

  public get logger(): Logger {
    return this.publicServer.context.services.logger
  }

  public set logger(logger: Logger) {
    this.publicServer.context.services.logger = logger
  }

  public listenPublic(port: number): http.Server {
    return this.publicServer.listen(port)
  }
}

export function createApp(
  config: RafikiServices,
  routes: ILPMiddleware<any>
): Rafiki {
  return new Rafiki(config, routes)
}
