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
  .option('accountService', ['ilpAddress'], (ilpAddress: string) => {
    return new MockAccountsService(ilpAddress)
  })
  .attr(
    'accounts',
    ['accountService'],
    (accountService: MockAccountsService) => {
      return accountService
    }
  )
  .attr('logger', TestLoggerFactory.build())
  .attr('rates', {
    convert: async (opts) => opts.sourceAmount
  })
  .attr(
    'redis',
    () =>
      new IORedis(`${process.env.REDIS}/${process.env.JEST_WORKER_ID}`, {
        // lazyConnect so that tests that don't use Redis don't have to disconnect it when they're finished.
        lazyConnect: true,
        stringNumbers: true
      })
  )
  .attr(
    'streamServer',
    new StreamServer({
      serverAddress: 'test.rafiki',
      serverSecret: crypto.randomBytes(32)
    })
  )
  .attr(
    'transferService',
    ['accountService'],
    (accountService: MockAccountsService) => {
      return {
        create: async (transfer) => accountService.transferFunds(transfer)
      }
    }
  )
