import { createContext } from '../../utils'
import {
  AccountInfoFactory,
  PeerFactory,
  RafikiServicesFactory
} from '../../factories'
import { RafikiContext } from '../../rafiki'
import { InMemoryAccountsService } from '../../services'
import { createAccountMiddleware } from '../../middleware/account'

describe('Account Middleware', () => {
  const incomingPeerInfo = PeerFactory.build({ id: 'incomingPeer' })
  const outgoingPeerInfo = PeerFactory.build({ id: 'outgoingPeer' })
  const accounts = new InMemoryAccountsService()
  const incomingAccount = AccountInfoFactory.build({ id: 'incomingPeer' })
  const outgoingAccount = AccountInfoFactory.build({ id: 'outgoingPeer' })
  accounts.add(incomingAccount)
  accounts.add(outgoingAccount)
  const rafikiServices = RafikiServicesFactory.build({ accounts })
  const mockPeers = {
    get incoming() {
      return Promise.resolve(incomingPeerInfo)
    },
    get outgoing() {
      return Promise.resolve(outgoingPeerInfo)
    }
  }

  test('the default sets the accountId to the peerId', async () => {
    const middleware = createAccountMiddleware()
    const next = jest.fn()
    const ctx = createContext<unknown, RafikiContext>()
    ctx.services = rafikiServices
    ctx.peers = mockPeers
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.accounts.incomingId).toEqual(incomingPeerInfo.id)
    expect(ctx.accounts.outgoingId).toEqual(outgoingPeerInfo.id)
  })

  test('can pass a custom function to get accountIds', async () => {
    const otherIncomingAccountInfo = AccountInfoFactory.build({
      id: 'otherIncomingAccount'
    })
    const otherOutgoingAccountInfo = AccountInfoFactory.build({
      id: 'otherOutgoingAccount'
    })
    accounts.add(otherIncomingAccountInfo)
    accounts.add(otherOutgoingAccountInfo)
    const middleware = createAccountMiddleware({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      getIncomingAccountId: (ctx: RafikiContext): Promise<string> => {
        return Promise.resolve('otherIncomingAccount')
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      getOutgoingAccountId: (ctx: RafikiContext): Promise<string> => {
        return Promise.resolve('otherOutgoingAccount')
      }
    })
    const next = jest.fn()
    const ctx = createContext<unknown, RafikiContext>()
    ctx.services = rafikiServices
    ctx.peers = mockPeers

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.accounts.incomingId).toEqual('otherIncomingAccount')
    expect(ctx.accounts.outgoingId).toEqual('otherOutgoingAccount')
  })
})
