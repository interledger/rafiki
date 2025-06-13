import { Redis } from 'ioredis'

import { AccountingService } from '../../../accounting/service'
import { IncomingPaymentService } from '../../../open_payments/payment/incoming/service'
import { WalletAddressService } from '../../../open_payments/wallet_address/service'
import { RatesService } from '../../../rates/service'
import { BaseService } from '../../../shared/baseService'
import { PeerService } from '../peer/service'
import {
  ILPContext,
  ILPMiddleware,
  Rafiki,
  createAccountMiddleware,
  createApp,
  createBalanceMiddleware,
  createClientController,
  createIldcpMiddleware,
  createIncomingErrorHandlerMiddleware,
  createIncomingMaxPacketAmountMiddleware,
  createIncomingRateLimitMiddleware,
  createIncomingThroughputMiddleware,
  createOutgoingExpireMiddleware,
  createOutgoingReduceExpiryMiddleware,
  createOutgoingThroughputMiddleware,
  createOutgoingValidateFulfillmentMiddleware,
  createStreamAddressMiddleware,
  createStreamController
} from './core'
import { TelemetryService } from '../../../telemetry/service'
import { TenantSettingService } from '../../../tenants/settings/service'
import { IAppConfig } from '../../../config/app'

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  redis: Redis
  ratesService: RatesService
  accountingService: AccountingService
  walletAddressService: WalletAddressService
  incomingPaymentService: IncomingPaymentService
  peerService: PeerService
  ilpAddress: string
  telemetry: TelemetryService
  tenantSettingService: TenantSettingService
}

export async function createConnectorService({
  logger,
  config,
  redis,
  ratesService,
  accountingService,
  walletAddressService,
  incomingPaymentService,
  peerService,
  ilpAddress,
  telemetry,
  tenantSettingService
}: ServiceDependencies): Promise<Rafiki> {
  return createApp(
    {
      //router: router,
      logger: logger.child({
        service: 'ConnectorService'
      }),
      config,
      accounting: accountingService,
      walletAddresses: walletAddressService,
      incomingPayments: incomingPaymentService,
      peers: peerService,
      redis,
      rates: ratesService,
      telemetry,
      tenantSettingService
    },
    compose([
      // Incoming Rules
      createIncomingErrorHandlerMiddleware(ilpAddress),
      createStreamAddressMiddleware(),
      createAccountMiddleware(),
      createIncomingMaxPacketAmountMiddleware(),
      createIncomingRateLimitMiddleware({}),
      createIncomingThroughputMiddleware(),
      createIldcpMiddleware(ilpAddress),

      // Local pay
      createBalanceMiddleware(),

      // Outgoing Rules
      createStreamController(),
      createOutgoingThroughputMiddleware(),
      createOutgoingReduceExpiryMiddleware({}),
      createOutgoingExpireMiddleware(),
      createOutgoingValidateFulfillmentMiddleware(),

      // Send outgoing packets
      createClientController()
    ])
  )
}

// Adapted from koa-compose
function compose(middlewares: ILPMiddleware[]): ILPMiddleware {
  return function (ctx: ILPContext, next: () => Promise<void>): Promise<void> {
    // last called middleware
    let index = -1
    return (function dispatch(i: number): Promise<void> {
      if (i <= index)
        return Promise.reject(new Error('next() called multiple times'))
      index = i
      let fn = middlewares[i]
      if (i === middlewares.length) fn = next
      if (!fn) return Promise.resolve()
      try {
        return Promise.resolve(fn(ctx, dispatch.bind(null, i + 1)))
      } catch (err) {
        return Promise.reject(err)
      }
    })(0)
  }
}
