import * as crypto from 'crypto'
import { Factory } from 'rosie'
import IORedis from 'ioredis'
import { StreamServer } from '@interledger/stream-receiver'
import { RafikiServices } from '../rafiki'
import { MockAccountsService } from '../test/mocks/accounts-service'
import { TestLoggerFactory } from './test-logger'

export const RafikiServicesFactory = Factory.define<RafikiServices>('PeerInfo')
  //.attr('router', ['peers'], (peers: InMemoryPeers) => {
  //  return new InMemoryRouter(peers, { ilpAddress: 'test.rafiki' })
  //})
  .attr('accounts', () => {
    return new MockAccountsService()
  })
  .attr('logger', TestLoggerFactory.build())
  .attr(
    'redis',
    () =>
      new IORedis({
        host: '127.0.0.1',
        port: 6379,
        lazyConnect: true
      })
  )
  .attr(
    'streamServer',
    new StreamServer({
      serverAddress: 'test.rafiki',
      serverSecret: crypto.randomBytes(32)
    })
  )
