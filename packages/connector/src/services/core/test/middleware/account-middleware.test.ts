import { createContext } from '../../../utils'
import {
  PeerFactory,
  IlpPrepareFactory,
  RafikiServicesFactory,
  AccountInfoFactory
} from '../../factories'
import { RafikiContext } from '../../rafiki'
import { InMemoryAccountsService } from '../../services'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'
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
    const ctx = createContext<any, RafikiContext>()
    ctx.services = rafikiServices
    ctx.peers = mockPeers
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const incomingAccount = await ctx.accounts.incoming
    const outgoingAccount = await ctx.accounts.outgoing

    expect(incomingAccount).toEqual(await accounts.get(incomingAccount.id))
    expect(outgoingAccount).toEqual(await accounts.get(outgoingAccount.id))
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
      getIncomingAccountId: (ctx: RafikiContext): Promise<string> => {
        return Promise.resolve('otherIncomingAccount')
      },
      getOutgoingAccountId: (ctx: RafikiContext): Promise<string> => {
        return Promise.resolve('otherOutgoingAccount')
      }
    })
    const next = jest.fn()
    const ctx = createContext<any, RafikiContext>()
    ctx.services = rafikiServices
    ctx.peers = mockPeers

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const incomingAccount = await ctx.accounts.incoming
    const outgoingAccount = await ctx.accounts.outgoing
    expect(incomingAccount).toEqual(await accounts.get('otherIncomingAccount'))
    expect(outgoingAccount).toEqual(await accounts.get('otherOutgoingAccount'))
  })
})
