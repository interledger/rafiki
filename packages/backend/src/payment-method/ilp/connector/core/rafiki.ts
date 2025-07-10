import * as http from 'http'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Errors } from 'ilp-packet'
import { Redis } from 'ioredis'
import Koa, { Middleware } from 'koa'
import { Logger } from 'pino'
import {
  LiquidityAccount,
  AccountingService
} from '../../../../accounting/service'
import { AssetOptions } from '../../../../asset/service'
import { IncomingPaymentService } from '../../../../open_payments/payment/incoming/service'
import { WalletAddressService } from '../../../../open_payments/wallet_address/service'
import { RatesService } from '../../../../rates/service'
import { PeerService } from '../../peer/service'
import { createTokenAuthMiddleware } from './middleware'
import {
  IlpResponse,
  ZeroCopyIlpPrepare,
  createIlpPacketMiddleware
} from './middleware/ilp-packet'
import { TelemetryService } from '../../../../telemetry/service'
import {
  incrementPreparePacketCount,
  incrementFulfillOrRejectPacketCount,
  incrementAmount
} from './telemetry'
import { IAppConfig } from '../../../../config/app'
import { TenantSettingService } from '../../../../tenants/settings/service'

// Model classes that represent an Interledger sender, receiver, or
// connector SHOULD implement this ConnectorAccount interface.
// Such models include:
//   ../../open_payments/wallet_address/model
//   ../../open_payments/payment/incoming/model
//   ../../open_payments/payment/outgoing/model
//   ../../peer/model
export interface ConnectorAccount extends LiquidityAccount {
  asset: LiquidityAccount['asset'] & AssetOptions
  tenantId: string
}

export interface IncomingAccount extends ConnectorAccount {
  maxPacketAmount?: bigint
  staticIlpAddress?: string
}

export interface OutgoingAccount extends ConnectorAccount {
  http?: {
    outgoing: {
      authToken: string
      endpoint: string
    }
  }
}

export interface TransferOptions {
  sourceAccount: IncomingAccount
  destinationAccount: OutgoingAccount
  sourceAmount: bigint
  destinationAmount?: bigint
  timeout: number
}

export interface RafikiServices {
  //router: Router
  accounting: AccountingService
  telemetry: TelemetryService
  walletAddresses: WalletAddressService
  logger: Logger
  incomingPayments: IncomingPaymentService
  peers: PeerService
  rates: RatesService
  redis: Redis
  tenantSettingService: TenantSettingService
  config: IAppConfig
}

export type HttpContextMixin = {
  services: RafikiServices
  accounts: {
    readonly incoming: IncomingAccount
    readonly outgoing: OutgoingAccount
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
    readonly incoming: IncomingAccount
    readonly outgoing: OutgoingAccount
  }
  request: {
    prepare: ZeroCopyIlpPrepare
    rawPrepare: Buffer
  }
  response: IlpResponse
  throw: (status: number, msg: string) => never
  revertTotalReceived?: () => Promise<number>
  state: T
}

export class Rafiki<T = any> {
  private redis: Redis

  private publicServer: Koa<T, HttpContextMixin> = new Koa()

  constructor(
    private config: RafikiServices,
    private routes: ILPMiddleware<any>
  ) {
    this.redis = config.redis
    const logger = config.logger

    const { redis } = this
    // Set global context that exposes services
    this.publicServer.context.services = {
      get config(): IAppConfig {
        return config.config
      },
      get incomingPayments(): IncomingPaymentService {
        return config.incomingPayments
      },
      get peers(): PeerService {
        return config.peers
      },
      get rates(): RatesService {
        return config.rates
      },
      get redis(): Redis {
        return redis
      },
      get accounting(): AccountingService {
        return config.accounting
      },
      get walletAddresses(): WalletAddressService {
        return config.walletAddresses
      },
      get telemetry(): TelemetryService {
        return config.telemetry
      },
      get tenantSettingService(): TenantSettingService {
        return config.tenantSettingService
      },
      logger
    }

    this.publicServer.use(createTokenAuthMiddleware())
    this.publicServer.use(createIlpPacketMiddleware(routes))
  }

  async handleIlpData(
    sourceAccount: IncomingAccount,
    unfulfillable: boolean,
    rawPrepare: Buffer
  ): Promise<Buffer> {
    const prepare = new ZeroCopyIlpPrepare(rawPrepare)
    const response = new IlpResponse()
    const telemetry = this.publicServer.context.services.telemetry

    incrementPreparePacketCount(unfulfillable, prepare.amount, telemetry)

    await this.routes(
      {
        request: { prepare, rawPrepare },
        response,
        services: this.publicServer.context.services,
        accounts: {
          // These are populated up by the accounts middleware.
          get incoming(): IncomingAccount {
            throw new Error('incoming account not available')
          },
          get outgoing(): OutgoingAccount {
            throw new Error('outgoing account not available')
          }
        },
        state: {
          incomingAccount: sourceAccount,
          unfulfillable
        },
        throw: (_status: number, msg: string): never => {
          throw new Errors.BadRequestError(msg)
        }
      },
      async () => {
        // unreachable, this is the end of the middleware chain
      }
    )
    if (!response.rawReply) throw new Error('error generating reply')

    const { code, scale } = sourceAccount.asset
    incrementFulfillOrRejectPacketCount(
      unfulfillable,
      prepare.amount,
      response,
      telemetry
    )
    await incrementAmount(
      unfulfillable,
      prepare.amount,
      response,
      code,
      scale,
      telemetry,
      sourceAccount.tenantId
    )
    return response.rawReply
  }

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
