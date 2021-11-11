import { createILPContext } from '../../utils'
import {
  AccountFactory,
  IlpPrepareFactory,
  PeerAccountFactory,
  RafikiServicesFactory
} from '../../factories'
import { createAccountMiddleware } from '../../middleware/account'
import { ZeroCopyIlpPrepare } from '../..'

describe('Account Middleware', () => {
  const ADDRESS = 'test.rafiki'
  const incomingAccount = PeerAccountFactory.build({
    id: 'incomingPeer'
  })
  const outgoingAccount = PeerAccountFactory.build({
    id: 'outgoingPeer'
  })
  const rafikiServices = RafikiServicesFactory.build({})

  beforeAll(async () => {
    await rafikiServices.accounts.create(incomingAccount)
    await rafikiServices.accounts.create(outgoingAccount)
  })

  test('set the accounts according to state and destination', async () => {
    const middleware = createAccountMiddleware(ADDRESS)
    const next = jest.fn()
    const ctx = createILPContext({
      state: { incomingAccount },
      services: rafikiServices,
      request: {
        prepare: new ZeroCopyIlpPrepare(
          IlpPrepareFactory.build({ destination: 'test.outgoingPeer.123' })
        ),
        rawPrepare: Buffer.alloc(0) // ignored
      }
    })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.accounts.incoming).toEqual(incomingAccount)
    expect(ctx.accounts.outgoing).toEqual(outgoingAccount)
  })

  test('set the accounts according to state and streamDestination', async () => {
    const outgoingAccount = AccountFactory.build({
      id: 'outgoingAccount'
    })
    await rafikiServices.accounts.create(outgoingAccount)
    const middleware = createAccountMiddleware(ADDRESS)
    const next = jest.fn()
    const ctx = createILPContext({
      state: {
        incomingAccount,
        streamDestination: outgoingAccount.id
      },
      services: rafikiServices,
      request: {
        prepare: new ZeroCopyIlpPrepare(
          IlpPrepareFactory.build({ destination: 'test.123' })
        ),
        rawPrepare: Buffer.alloc(0) // ignored
      }
    })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.accounts.incoming).toEqual(incomingAccount)
    expect(ctx.accounts.outgoing).toEqual(outgoingAccount)
  })

  test('return an error when the source account is disabled', async () => {
    const middleware = createAccountMiddleware(ADDRESS)
    const next = jest.fn()
    const ctx = createILPContext({
      state: { incomingAccount: PeerAccountFactory.build({ finalized: true }) },
      services: rafikiServices,
      request: {
        prepare: new ZeroCopyIlpPrepare(
          IlpPrepareFactory.build({ destination: 'test.outgoingPeer.123' })
        ),
        rawPrepare: Buffer.alloc(0) // ignored
      }
    })
    await expect(middleware(ctx, next)).rejects.toThrowError(
      'source account is disabled'
    )
  })

  test('return an error when the destination account is disabled', async () => {
    outgoingAccount.finalized = true
    const middleware = createAccountMiddleware(ADDRESS)
    const next = jest.fn()
    const ctx = createILPContext({
      state: { incomingAccount },
      services: rafikiServices,
      request: {
        prepare: new ZeroCopyIlpPrepare(
          IlpPrepareFactory.build({ destination: 'test.outgoingPeer.123' })
        ),
        rawPrepare: Buffer.alloc(0) // ignored
      }
    })
    await expect(middleware(ctx, next)).rejects.toThrowError(
      'destination account is disabled'
    )
  })
})
