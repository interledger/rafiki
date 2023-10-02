import assert from 'assert'
import { Errors } from 'ilp-packet'
import { createILPContext } from '../../utils'
import { ZeroCopyIlpPrepare } from '../..'
import { createBalanceMiddleware } from '../../middleware'
import {
  IncomingAccountFactory,
  OutgoingAccountFactory,
  IlpPrepareFactory,
  IlpFulfillFactory,
  IlpRejectFactory,
  RafikiServicesFactory
} from '../../factories'
const { InsufficientLiquidityError } = Errors

// TODO: make one peer to many account relationship
const aliceAccount = IncomingAccountFactory.build({ id: 'alice' })
const bobAccount = OutgoingAccountFactory.build({ id: 'bob' })
assert.ok(aliceAccount.id)
assert.ok(bobAccount.id)
const services = RafikiServicesFactory.build({})
const ctx = createILPContext({
  accounts: {
    get incoming() {
      return aliceAccount
    },
    get outgoing() {
      return bobAccount
    }
  },
  services
})
const { accounting, rates } = services

beforeEach(async () => {
  ctx.response.fulfill = undefined
  ctx.response.reject = undefined

  aliceAccount.balance = 100n
  bobAccount.balance = 0n

  await accounting.create(aliceAccount)
  await accounting.create(bobAccount)
})

describe('Balance Middleware', function () {
  const middleware = createBalanceMiddleware()

  it('fulfill response increments the balanceReceivable for the incoming peer and balancePayable for the outgoing peer', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '100' })
    const fulfill = IlpFulfillFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.fulfill = fulfill
    })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)

    const aliceBalance = await accounting.getBalance(aliceAccount.id)
    expect(aliceBalance).toEqual(BigInt(0))

    const bobBalance = await accounting.getBalance(bobAccount.id)
    expect(bobBalance).toEqual(BigInt(100))
  })

  it('converts prepare amount to destination asset', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '100' })
    const fulfill = IlpFulfillFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.fulfill = fulfill
    })
    const destinationAmount = BigInt(200)
    jest
      .spyOn(rates, 'convert')
      .mockImplementationOnce(async () => destinationAmount)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(prepare.amount).toEqual(destinationAmount.toString())
  })

  test.each`
    amount   | state                            | error                         | createTransfer | description
    ${'100'} | ${{}}                            | ${undefined}                  | ${true}        | ${'reject response does not adjust the account balances'}
    ${'0'}   | ${{}}                            | ${undefined}                  | ${false}       | ${'ignores 0 amount packets'}
    ${'200'} | ${{}}                            | ${InsufficientLiquidityError} | ${true}        | ${'insufficient liquidity throws T04'}
    ${'100'} | ${{ unfulfillable: true }}       | ${undefined}                  | ${false}       | ${'does not adjust account balances for unfulfillable outgoing packets'}
    ${'100'} | ${{ streamDestination: 'here' }} | ${undefined}                  | ${false}       | ${'does not adjust account balances for unfulfillable incoming packets'}
  `(
    '$description',
    async ({ amount, state, error, createTransfer }): Promise<void> => {
      const prepare = IlpPrepareFactory.build({ amount })
      const reject = IlpRejectFactory.build()
      ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
      ctx.state = state
      const next = jest.fn().mockImplementation(() => {
        ctx.response.reject = reject
      })

      const createTransferSpy = jest.spyOn(accounting, 'createTransfer')

      if (error) {
        await expect(middleware(ctx, next)).rejects.toBeInstanceOf(error)
        expect(next).not.toHaveBeenCalled()
      } else {
        await expect(middleware(ctx, next)).resolves.toBeUndefined()
        expect(next).toHaveBeenCalledTimes(1)
      }

      expect(createTransferSpy).toHaveBeenCalledTimes(createTransfer ? 1 : 0)

      const aliceBalance = await accounting.getBalance(aliceAccount.id)
      expect(aliceBalance).toEqual(BigInt(100))

      const bobBalance = await accounting.getBalance(bobAccount.id)
      expect(bobBalance).toEqual(BigInt(0))
    }
  )
})
