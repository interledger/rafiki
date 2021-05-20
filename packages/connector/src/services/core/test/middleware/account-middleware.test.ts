import { createContext } from '../../utils'
import {
  IlpPrepareFactory,
  PeerAccountFactory,
  RafikiServicesFactory
} from '../../factories'
import { RafikiContext } from '../../rafiki'
import { createAccountMiddleware } from '../../middleware/account'
import { ZeroCopyIlpPrepare } from '../..'

describe('Account Middleware', () => {
  const incomingAccount = PeerAccountFactory.build({
    accountId: 'incomingPeer'
  })
  const outgoingAccount = PeerAccountFactory.build({
    accountId: 'outgoingPeer'
  })
  const rafikiServices = RafikiServicesFactory.build({})

  beforeAll(async () => {
    await rafikiServices.accounts.createAccount(incomingAccount)
    await rafikiServices.accounts.createAccount(outgoingAccount)
  })

  test('set the accountId to the state.account', async () => {
    const middleware = createAccountMiddleware()
    const next = jest.fn()
    const ctx = createContext<unknown, RafikiContext>()
    ctx.state = { account: incomingAccount }
    ctx.services = rafikiServices
    ctx.request.prepare = new ZeroCopyIlpPrepare(
      IlpPrepareFactory.build({ destination: 'test.outgoingPeer.123' })
    )
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.accounts.incoming).toEqual(incomingAccount)
    expect(ctx.accounts.outgoing).toEqual(outgoingAccount)
  })
})
