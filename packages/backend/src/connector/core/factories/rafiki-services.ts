import * as crypto from 'crypto'
import { Factory } from 'rosie'
import IORedis from 'ioredis'
import { StreamServer } from '@interledger/stream-receiver'
import { RafikiServices } from '../rafiki'
import { MockAccountsService } from '../test/mocks/accounts-service'
import { TestLoggerFactory } from './test-logger'

interface MockRafikiServices extends RafikiServices {
  accounts: MockAccountsService
}

export const RafikiServicesFactory = Factory.define<MockRafikiServices>(
  'PeerInfo'
)
  //.attr('router', ['peers'], (peers: InMemoryPeers) => {
  //  return new InMemoryRouter(peers, { ilpAddress: 'test.rafiki' })
  //})
  .option('ilpAddress', 'test.rafiki')
  .attr('accounts', () => {
    return new MockAccountsService()
  })
  .attr('logger', TestLoggerFactory.build())
  .attr('invoices', ['accounts'], (accounts: MockAccountsService) => ({
    get: async (id: string) => {
      const account = await accounts._get(id)
      if (account) {
        return {
          ...account,
          paymentPointer: {
            asset: account.asset
          },
          tbAccountId: account.id,
          amountToReceive: account.receiveLimit
        }
      }
    }
  }))
  .attr('peers', ['accounts'], (accounts: MockAccountsService) => ({
    getByDestinationAddress: async (address: string) => {
      const account = await accounts._getByDestinationAddress(address)
      if (account) {
        return {
          ...account,
          tbAccountId: account.id
        }
      }
    },
    getByIncomingToken: async (token: string) => {
      const account = await accounts._getByIncomingToken(token)
      if (account) {
        return {
          ...account,
          tbAccountId: account.id
        }
      }
    }
  }))
  .attr('rates', {
    convert: async (opts) => opts.sourceAmount,
    prices: () => {
      throw new Error('unimplemented')
    }
  })
  .attr(
    'redis',
    () =>
      new IORedis(`${process.env.REDIS_URL}/${process.env.JEST_WORKER_ID}`, {
        // lazyConnect so that tests that don't use Redis don't have to disconnect it when they're finished.
        lazyConnect: true,
        stringNumbers: true
      })
  )
  .attr(
    'streamServer',
    ['ilpAddress'],
    (ilpAddress: string) =>
      new StreamServer({
        serverAddress: ilpAddress,
        serverSecret: crypto.randomBytes(32)
      })
  )
