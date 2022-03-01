import { createILPContext } from '../../utils'
import {
  AccountFactory,
  IlpPrepareFactory,
  IncomingPaymentAccountFactory,
  IncomingPeerFactory,
  OutgoingPeerFactory,
  RafikiServicesFactory
} from '../../factories'
import { createAccountMiddleware } from '../../middleware/account'
import { ZeroCopyIlpPrepare } from '../..'

describe('Account Middleware', () => {
  const ADDRESS = 'test.rafiki'
  const incomingAccount = IncomingPeerFactory.build({
    id: 'incomingPeer'
  })
  const rafikiServices = RafikiServicesFactory.build({})

  beforeAll(async () => {
    await rafikiServices.accounting.create(incomingAccount)
  })

  test('set the accounts according to state and destination', async () => {
    const outgoingAccount = OutgoingPeerFactory.build({
      id: 'outgoingPeer'
    })
    await rafikiServices.accounting.create(outgoingAccount)

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

  test('set the accounts according to state and streamDestination incoming payment', async () => {
    const outgoingAccount = IncomingPaymentAccountFactory.build({
      id: 'outgoingIncomingPayment'
    })
    await rafikiServices.accounting.create(outgoingAccount)
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

  test('set the accounts according to state and streamDestination SPSP fallback', async () => {
    const outgoingAccount = AccountFactory.build({
      id: 'spspFallback'
    })
    await rafikiServices.accounting.create(outgoingAccount)
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

  test('return an error when the destination account is disabled', async () => {
    const outgoingAccount = IncomingPaymentAccountFactory.build({
      id: 'deactivatedIncomingPayment',
      active: false
    })
    await rafikiServices.accounting.create(outgoingAccount)
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
    await expect(middleware(ctx, next)).rejects.toThrowError(
      'destination account is disabled'
    )
  })
})
