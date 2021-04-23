import { createContext } from '@interledger/rafiki-utils'
import { RafikiContext } from '../../src/rafiki'
import { InMemoryPeers, InMemoryRouter } from '../../src/services'
import {
  PeerInfoFactory,
  IlpPrepareFactory,
  RafikiServicesFactory
} from '../../src/factories'
import { SELF_PEER_ID } from '../../src/constants'
import { createIldcpProtocolController } from '../../src/controllers/ildcp-protocol'
import { ZeroCopyIlpPrepare } from '../../src/middleware/ilp-packet'

// TODO: waiting for peers and accounts interface to be finalised
describe.skip('ILDCP Controller', function () {
  const peers = new InMemoryPeers()
  const router = new InMemoryRouter(peers, { ilpAddress: 'test.rafiki' })
  const alice = PeerInfoFactory.build({ id: 'alice' })
  const selfPeer = PeerInfoFactory.build({ id: SELF_PEER_ID })
  const services = RafikiServicesFactory.build({ router }, { peers })

  beforeAll(async () => {
    await peers.add(selfPeer)
    await peers.add(alice)
  })

  test('throws error if destination is not peer.config', async () => {
    const prepare = new ZeroCopyIlpPrepare(
      IlpPrepareFactory.build({ destination: 'peer.config' })
    )
    const ctx = createContext<any, RafikiContext>()
    ctx.services = services
    ctx.peers = {
      get incoming () {
        return peers.get('alice')
      },
      get outgoing () {
        return peers.get(SELF_PEER_ID)
      }
    }
    const middleware = createIldcpProtocolController()

    await expect(middleware(ctx)).resolves.toBeUndefined()
  })

  test('throws error if peer relation is not a child')

  test('sets the reply as an ildcp serve response')
})
