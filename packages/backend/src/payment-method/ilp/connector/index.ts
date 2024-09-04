import { StreamServer } from '@interledger/stream-receiver'
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

interface ServiceDependencies extends BaseService {
  redis: Redis
  ratesService: RatesService
  accountingService: AccountingService
  walletAddressService: WalletAddressService
  incomingPaymentService: IncomingPaymentService
  peerService: PeerService
  streamServer: StreamServer
  ilpAddress: string
  telemetry?: TelemetryService
}

export async function createConnectorService({
  logger,
  redis,
  ratesService,
  accountingService,
  walletAddressService,
  incomingPaymentService,
  peerService,
  streamServer,
  ilpAddress,
  telemetry
}: ServiceDependencies): Promise<Rafiki> {
  return createApp(
    {
      //router: router,
      logger: logger.child({
        service: 'ConnectorService'
      }),
      accounting: accountingService,
      walletAddresses: walletAddressService,
      incomingPayments: incomingPaymentService,
      peers: peerService,
      redis,
      rates: ratesService,
      streamServer,
      telemetry
    },
    compose(
      [
        // Incoming Rules
        {
          name: 'createIncomingErrorHandlerMiddleware',
          fn: createIncomingErrorHandlerMiddleware(ilpAddress)
        },
        {
          name: 'createStreamAddressMiddleware',
          fn: createStreamAddressMiddleware()
        },
        {
          name: 'createAccountMiddleware',
          fn: createAccountMiddleware(ilpAddress)
        },
        {
          name: 'createIncomingMaxPacketAmountMiddleware',
          fn: createIncomingMaxPacketAmountMiddleware()
        },
        {
          name: 'createIncomingRateLimitMiddleware',
          fn: createIncomingRateLimitMiddleware({})
        },
        {
          name: 'createIncomingThroughputMiddleware',
          fn: createIncomingThroughputMiddleware()
        },
        {
          name: 'createIldcpMiddleware',
          fn: createIldcpMiddleware(ilpAddress)
        },

        // Local pay
        { name: 'createBalanceMiddleware', fn: createBalanceMiddleware() },

        // Outgoing Rules
        { name: 'createStreamController', fn: createStreamController() },
        {
          name: 'createOutgoingThroughputMiddleware',
          fn: createOutgoingThroughputMiddleware()
        },
        {
          name: 'createOutgoingReduceExpiryMiddleware',
          fn: createOutgoingReduceExpiryMiddleware({})
        },
        {
          name: 'createOutgoingExpireMiddleware',
          fn: createOutgoingExpireMiddleware()
        },
        {
          name: 'createOutgoingValidateFulfillmentMiddleware',
          fn: createOutgoingValidateFulfillmentMiddleware()
        },

        // Send outgoing packets
        { name: 'createClientController', fn: createClientController() }
      ],
      telemetry
    )
  )
}

// Adapted from koa-compose
function compose(
  middlewares: { name: string; fn: ILPMiddleware }[],
  telemetry: TelemetryService | undefined
): ILPMiddleware {
  return function (ctx: ILPContext, next: () => Promise<void>): Promise<void> {
    // last called middleware
    let index = -1

    const stopTimer = telemetry?.startTimer('connector_middleware_stack', {
      callName: 'connector_middleware_stack'
    })

    async function dispatch(i: number): Promise<void> {
      if (i <= index)
        return Promise.reject(new Error('next() called multiple times'))
      index = i
      const m = middlewares[i]
      if (i === middlewares.length) m.fn = next
      if (!m.fn) return Promise.resolve()
      try {
        const stopTimerMiddleware = telemetry?.startTimer(
          'connector_middleware',
          { callName: m.name }
        )
        const p = Promise.resolve(m.fn(ctx, dispatch.bind(null, i + 1)))
        stopTimerMiddleware && stopTimerMiddleware()
        return p
      } catch (err) {
        return Promise.reject(err)
      }
    }

    return dispatch(0).finally(() => {
      stopTimer && stopTimer()
    })
  }
}
