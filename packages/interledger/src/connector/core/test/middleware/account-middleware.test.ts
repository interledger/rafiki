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
    id: 'incomingPeer'
  })
  const outgoingAccount = PeerAccountFactory.build({
    id: 'outgoingPeer'
  })
  const rafikiServices = RafikiServicesFactory.build({})

  beforeAll(async () => {
    await rafikiServices.accounts.createAccount(incomingAccount)
    await rafikiServices.accounts.createAccount(outgoingAccount)
  })

  test('set the accounts according to state and destination', async () => {
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

  test('set the accounts according to state and streamDestination', async () => {
    const middleware = createAccountMiddleware()
    const next = jest.fn()
    const ctx = createContext<unknown, RafikiContext>()
    ctx.state = {
      account: incomingAccount,
      streamDestination: outgoingAccount.id
    }
    ctx.services = rafikiServices
    ctx.request.prepare = new ZeroCopyIlpPrepare(
      IlpPrepareFactory.build({ destination: 'test.123' })
    )
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.accounts.incoming).toEqual(incomingAccount)
    expect(ctx.accounts.outgoing).toEqual(outgoingAccount)
  })

  test('return an error when the source account is disabled', async () => {
    const middleware = createAccountMiddleware()
    const next = jest.fn()
    const ctx = createContext<unknown, RafikiContext>()
    ctx.state = { account: PeerAccountFactory.build({ disabled: true }) }
    ctx.services = rafikiServices
    ctx.request.prepare = new ZeroCopyIlpPrepare(
      IlpPrepareFactory.build({ destination: 'test.outgoingPeer.123' })
    )
    await expect(middleware(ctx, next)).rejects.toThrowError(
      'source account is disabled'
    )
  })

  test('return an error when the destination account is disabled', async () => {
    outgoingAccount.disabled = true
    const middleware = createAccountMiddleware()
    const next = jest.fn()
    const ctx = createContext<unknown, RafikiContext>()
    ctx.state = { account: incomingAccount }
    ctx.services = rafikiServices
    ctx.request.prepare = new ZeroCopyIlpPrepare(
      IlpPrepareFactory.build({ destination: 'test.outgoingPeer.123' })
    )
    await expect(middleware(ctx, next)).rejects.toThrowError(
      'destination account is disabled'
    )
  })
})
