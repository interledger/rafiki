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
import { CreateAccountError } from '../../../../accounting/errors'
import { CreateAccountError as CreateAccountErrorCode } from 'tigerbeetle-node'

describe('Account Middleware', () => {
  const ADDRESS = 'test.rafiki'
  const incomingAccount = IncomingPeerFactory.build({
    id: 'incomingPeer'
  })
  const rafikiServices = RafikiServicesFactory.build({})

  beforeAll(async () => {
    await rafikiServices.accounting.create(incomingAccount)
  })

  test.each`
    name                                                                            | factory                          | id                              | state          | called   | createThrows                                                     | error
    ${'set the accounts according to state and destination'}                        | ${OutgoingPeerFactory}           | ${'outgoingPeer'}               | ${'PENDING'}   | ${true}  | ${undefined}                                                     | ${''}
    ${'set the accounts according to state and streamDestination incoming payment'} | ${IncomingPaymentAccountFactory} | ${'outgoingIncomingPayment'}    | ${'PENDING'}   | ${true}  | ${undefined}                                                     | ${''}
    ${'set the accounts according to state and streamDestination SPSP fallback'}    | ${AccountFactory}                | ${'spspFallback'}               | ${'PENDING'}   | ${true}  | ${undefined}                                                     | ${''}
    ${'create TB account for PENDING incoming payment throws exists'}               | ${IncomingPaymentAccountFactory} | ${'tbIncomingPayment'}          | ${'PENDING'}   | ${true}  | ${new CreateAccountError(CreateAccountErrorCode.exists)}         | ${''}
    ${'create TB account for PENDING incoming payment throws error'}                | ${IncomingPaymentAccountFactory} | ${'tbIncomingPayment'}          | ${'PENDING'}   | ${true}  | ${new CreateAccountError(CreateAccountErrorCode.reserved_field)} | ${'CreateAccountError code=10'}
    ${'return an error when the destination account is disabled'}                   | ${IncomingPaymentAccountFactory} | ${'deactivatedIncomingPayment'} | ${'COMPLETED'} | ${false} | ${undefined}                                                     | ${'destination account is disabled'}
  `(
    '$name',
    async ({
      id,
      factory,
      state,
      called,
      createThrows,
      error
    }): Promise<void> => {
      const outgoingAccount = factory.build({
        id: id,
        state: state
      })
      await rafikiServices.accounting.create(outgoingAccount)
      const middleware = createAccountMiddleware(ADDRESS)
      const next = jest.fn()
      const ctx = createILPContext({
        state: {
          incomingAccount,
          streamDestination: id
        },
        services: rafikiServices,
        request: {
          prepare: new ZeroCopyIlpPrepare(
            IlpPrepareFactory.build({ destination: 'test.123' })
          ),
          rawPrepare: Buffer.alloc(0) // ignored
        }
      })

      const spy = jest.spyOn(
        rafikiServices.accounting,
        'createLiquidityAccount'
      )
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
      if (called) {
        expect(spy).toHaveBeenCalled()
      }
    }
  )
})
