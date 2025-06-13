import { Errors } from 'ilp-packet'
import { ZeroCopyIlpPrepare } from '../..'
import { AccountAlreadyExistsError } from '../../../../../../accounting/errors'
import { LiquidityAccountType } from '../../../../../../accounting/service'
import {
  AccountFactory,
  IlpPrepareFactory,
  IncomingPaymentAccountFactory,
  IncomingPeerFactory,
  OutgoingPeerFactory,
  RafikiServicesFactory
} from '../../factories'
import { createAccountMiddleware } from '../../middleware/account'
import { createILPContext } from '../../utils'
import { Peer } from '../../../../peer/model'

describe('Account Middleware', () => {
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

    const middleware = createAccountMiddleware()
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
    const middleware = createAccountMiddleware()
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
    const middleware = createAccountMiddleware()
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

  test('finds peer as outgoing account when no streamDestination present', async () => {
    const tenantId = crypto.randomUUID()
    const outgoingAccount = AccountFactory.build({
      id: 'peer'
    })

    const getByDestinationAddressSpy = jest
      .spyOn(rafikiServices.peers, 'getByDestinationAddress')
      .mockResolvedValueOnce(outgoingAccount as unknown as Peer)

    await rafikiServices.accounting.create(outgoingAccount)
    const middleware = createAccountMiddleware()
    const next = jest.fn()
    const ctx = createILPContext({
      state: {
        incomingAccount: {
          ...incomingAccount,
          tenantId
        }
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

    expect(ctx.accounts.incoming).toEqual({ ...incomingAccount, tenantId })
    expect(ctx.accounts.outgoing).toEqual(outgoingAccount)
    expect(getByDestinationAddressSpy).toHaveBeenCalledWith(
      'test.123',
      tenantId
    )
  })

  test('return an error when the destination account is in an incorrect state', async () => {
    const outgoingAccount = IncomingPaymentAccountFactory.build({
      id: 'deactivatedIncomingPayment',
      state: 'COMPLETED'
    })
    await rafikiServices.accounting.create(outgoingAccount)
    const middleware = createAccountMiddleware()
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
    await expect(middleware(ctx, next)).rejects.toThrow(
      'destination account is in an incorrect state'
    )
  })

  test('return an error when the destination account unknown', async () => {
    const middleware = createAccountMiddleware()
    const next = jest.fn()
    const ctx = createILPContext({
      state: {
        incomingAccount,
        streamDestination: 'no-destination'
      },
      services: rafikiServices,
      request: {
        prepare: new ZeroCopyIlpPrepare(
          IlpPrepareFactory.build({ destination: 'test.123' })
        ),
        rawPrepare: Buffer.alloc(0) // ignored
      }
    })
    await expect(middleware(ctx, next)).rejects.toThrow(
      'unknown destination account'
    )
    await expect(middleware(ctx, next)).rejects.toThrow(Errors.UnreachableError)
  })

  test('sets disabled destination account if amount is 0', async () => {
    const outgoingAccount = IncomingPaymentAccountFactory.build({
      id: 'deactivatedIncomingPayment',
      state: 'COMPLETED'
    })
    await rafikiServices.accounting.create(outgoingAccount)
    const middleware = createAccountMiddleware()
    const next = jest.fn()
    const ctx = createILPContext({
      state: {
        incomingAccount,
        streamDestination: outgoingAccount.id
      },
      services: rafikiServices,
      request: {
        prepare: new ZeroCopyIlpPrepare(
          IlpPrepareFactory.build({ amount: '0', destination: 'test.123' })
        ),
        rawPrepare: Buffer.alloc(0) // ignored
      }
    })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.accounts.incoming).toEqual(incomingAccount)
    expect(ctx.accounts.outgoing).toEqual(outgoingAccount)
  })

  test.each`
    name                                                              | createThrows                         | error
    ${'create TB account for PENDING incoming payment success'}       | ${undefined}                         | ${''}
    ${'create TB account for PENDING incoming payment throws exists'} | ${new AccountAlreadyExistsError('')} | ${''}
    ${'create TB account for PENDING incoming payment throws error'}  | ${new Error('other error')}          | ${'other error'}
  `('$name', async ({ createThrows, error }): Promise<void> => {
    const outgoingAccount = IncomingPaymentAccountFactory.build({
      id: 'tbIncomingPayment',
      state: 'PENDING'
    })
    await rafikiServices.accounting.create(outgoingAccount)
    const middleware = createAccountMiddleware()
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

    const spy = jest.spyOn(rafikiServices.accounting, 'createLiquidityAccount')
    if (createThrows) {
      spy.mockRejectedValueOnce(createThrows)
    }
    if (error) {
      await expect(middleware(ctx, next)).rejects.toThrowError(error)
    } else {
      await expect(middleware(ctx, next)).resolves.toBeUndefined()
      expect(ctx.accounts.outgoing).toEqual(outgoingAccount)
      expect(ctx.accounts.incoming).toEqual(incomingAccount)
    }
    expect(spy).toHaveBeenCalledWith(
      outgoingAccount,
      LiquidityAccountType.INCOMING
    )
  })

  test.each`
    name                                                    | createThrows                         | error
    ${'create TB account for wallet address success'}       | ${undefined}                         | ${''}
    ${'create TB account for wallet address throws exists'} | ${new AccountAlreadyExistsError('')} | ${''}
    ${'create TB account for wallet address throws error'}  | ${new Error('other error')}          | ${'other error'}
  `('$name', async ({ createThrows, error }): Promise<void> => {
    const outgoingAccount = AccountFactory.build({
      id: 'spspFallback'
    })
    await rafikiServices.accounting.create(outgoingAccount)
    const middleware = createAccountMiddleware()
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

    const spy = jest.spyOn(rafikiServices.accounting, 'createLiquidityAccount')
    if (createThrows) {
      spy.mockRejectedValueOnce(createThrows)
    }
    if (error) {
      await expect(middleware(ctx, next)).rejects.toThrowError(error)
    } else {
      await expect(middleware(ctx, next)).resolves.toBeUndefined()
      expect(ctx.accounts.outgoing).toEqual(outgoingAccount)
      expect(ctx.accounts.incoming).toEqual(incomingAccount)
    }
    expect(spy).toHaveBeenCalledWith(
      outgoingAccount,
      LiquidityAccountType.WEB_MONETIZATION
    )
  })
})
