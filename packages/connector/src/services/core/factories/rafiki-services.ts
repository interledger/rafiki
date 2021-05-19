import { Factory } from 'rosie'
import { RafikiServices } from '../rafiki'
import { MockAccountsService } from '../test/mocks/accounts-service'
import { TestLoggerFactory } from './test-logger'

export const RafikiServicesFactory = Factory.define<RafikiServices>('PeerInfo')
  //.option('peers', new InMemoryPeers())
  //.attr('peers', ['peers'], (peers: InMemoryPeers) => {
  //  return peers
  //})
  //.attr('router', ['peers'], (peers: InMemoryPeers) => {
  //  return new InMemoryRouter(peers, { ilpAddress: 'test.rafiki' })
  //})
  .attr('accounts', () => {
    return new MockAccountsService()
  })
  .attr('logger', TestLoggerFactory.build())
