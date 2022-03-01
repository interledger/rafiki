import IORedis from 'ioredis'
import { StreamServer } from '@interledger/stream-receiver'

import {
  createApp,
  Rafiki,
  ILPContext,
  ILPMiddleware,
  createBalanceMiddleware,
  createIncomingErrorHandlerMiddleware,
  createIldcpMiddleware,
  createStreamController,
  createOutgoingExpireMiddleware,
  createClientController,
  createIncomingMaxPacketAmountMiddleware,
  createIncomingRateLimitMiddleware,
  createIncomingThroughputMiddleware,
  createOutgoingReduceExpiryMiddleware,
  createOutgoingThroughputMiddleware,
  createOutgoingValidateFulfillmentMiddleware,
  createAccountMiddleware,
  createStreamAddressMiddleware
} from './core'
import { AccountingService } from '../accounting/service'
import { AccountService } from '../open_payments/account/service'
import { IncomingPaymentService } from '../open_payments/invoice/service'
import { PeerService } from '../peer/service'
import { RatesService } from '../rates/service'
import { BaseService } from '../shared/baseService'

interface ServiceDependencies extends BaseService {
  redis: IORedis.Redis
  ratesService: RatesService
  accountingService: AccountingService
  accountService: AccountService
  incomingPaymentService: IncomingPaymentService
  peerService: PeerService
  streamServer: StreamServer
  ilpAddress: string
}

export async function createConnectorService({
  logger,
  redis,
  ratesService,
  accountingService,
  accountService,
  incomingPaymentService,
  peerService,
  streamServer,
  ilpAddress
}: ServiceDependencies): Promise<Rafiki> {
  return createApp(
    {
      //router: router,
      logger: logger.child({
        service: 'ConnectorService'
      }),
      accounting: accountingService,
      accounts: accountService,
      incomingPayments: incomingPaymentService,
      peers: peerService,
      redis,
      rates: ratesService,
      streamServer
    },
    compose([
      // Incoming Rules
      createIncomingErrorHandlerMiddleware(ilpAddress),
      createStreamAddressMiddleware(),
      createAccountMiddleware(ilpAddress),
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
