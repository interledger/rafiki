import { Factory } from 'rosie'
import { RafikiServices } from '../rafiki'
import {
  InMemoryPeers,
  InMemoryRouter,
  InMemoryAccountsService
} from '../services'
import { TestLoggerFactory } from './test-logger'

export const RafikiServicesFactory = Factory.define<RafikiServices>('PeerInfo')
  .option('peers', new InMemoryPeers())
  .attr('peers', ['peers'], (peers: InMemoryPeers) => {
    return peers
  })
  .attr('router', ['peers'], (peers: InMemoryPeers) => {
    return new InMemoryRouter(peers, { ilpAddress: 'test.rafiki' })
  })
  .attr('accounts', ['peers'], () => {
    return new InMemoryAccountsService()
  })
  .attr('logger', TestLoggerFactory.build())
