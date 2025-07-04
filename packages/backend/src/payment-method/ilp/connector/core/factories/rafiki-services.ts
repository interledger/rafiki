import { Factory } from 'rosie'
import { Redis } from 'ioredis'
import { RafikiServices } from '../rafiki'
import { MockAccountingService } from '../test/mocks/accounting-service'
import { TestLoggerFactory } from './test-logger'
import { MockTelemetryService } from '../../../../../tests/telemetry'
import { Config } from '../../../../../config/app'

interface MockRafikiServices extends RafikiServices {
  accounting: MockAccountingService
  telemetry: MockTelemetryService
}

export const RafikiServicesFactory = Factory.define<MockRafikiServices>(
  'PeerInfo'
)
  //.attr('router', ['peers'], (peers: InMemoryPeers) => {
  //  return new InMemoryRouter(peers, { ilpAddress: 'test.rafiki' })
  //})
  .option('ilpAddress', 'test.rafiki')
  .attr('config', () => {
    return Config
  })
  .attr('accounting', () => {
    return new MockAccountingService()
  })
  .attr('telemetry', () => new MockTelemetryService())
  .attr('logger', TestLoggerFactory.build())
  .attr(
    'walletAddresses',
    ['accounting'],
    (accounting: MockAccountingService) => ({
      get: async (id: string) => await accounting._getAccount(id)
    })
  )
  .attr(
    'incomingPayments',
    ['accounting'],
    (accounting: MockAccountingService) => ({
      get: async ({ id }: { id: string }) =>
        await accounting._getIncomingPayment(id),
      handlePayment: async (_id: string) => {
        return undefined
      }
    })
  )
  .attr('tenantSettingService', () => ({
    get: async () => {
      return []
    },
    create: async () => {
      throw new Error('unimplemented')
    },
    update: async () => {
      throw new Error('unimplemented')
    },
    delete: async () => {
      throw new Error('unimplemented')
    },
    getPage: async () => {
      throw new Error('unimplemented')
    },
    getSettingsByPrefix: async () => {
      throw new Error('unimplemented')
    }
  }))
  .attr('peers', ['accounting'], (accounting: MockAccountingService) => ({
    getByDestinationAddress: async (address: string) =>
      await accounting._getByDestinationAddress(address),
    getByIncomingToken: async (token: string) =>
      await accounting._getByIncomingToken(token)
  }))
  .attr('rates', {
    convertSource: async (opts) => ({
      amount: opts.sourceAmount,
      scaledExchangeRate: 1
    }),
    convertDestination: async (opts) => ({
      amount: opts.destinationAmount,
      scaledExchangeRate: 1
    }),
    rates: () => {
      throw new Error('unimplemented')
    }
  })
  .attr(
    'redis',
    () =>
      new Redis(`${process.env.REDIS_URL}/${process.env.JEST_WORKER_ID}`, {
        // lazyConnect so that tests that don't use Redis don't have to disconnect it when they're finished.
        lazyConnect: true,
        stringNumbers: true
      })
  )
