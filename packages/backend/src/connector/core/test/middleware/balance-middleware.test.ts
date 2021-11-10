import { Errors } from 'ilp-packet'
import { createILPContext } from '../../utils'
import { ZeroCopyIlpPrepare } from '../..'
import { createBalanceMiddleware } from '../../middleware'
import {
  AccountFactory,
  IlpPrepareFactory,
  IlpFulfillFactory,
  IlpRejectFactory,
  RafikiServicesFactory
} from '../../factories'
import { AccountTransferError } from '../../../../tigerbeetle/account/errors'

// TODO: make one peer to many account relationship
const aliceAccount = AccountFactory.build({ id: 'alice' })
const bobAccount = AccountFactory.build({ id: 'bob' })
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
const { accounts, rates } = services

beforeEach(async () => {
  ctx.response.fulfill = undefined
  ctx.response.reject = undefined

  aliceAccount.balance = 100n
  bobAccount.balance = 0n

  await accounts.create(aliceAccount)
  await accounts.create(bobAccount)
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

    const aliceBalance = await accounts.getBalance(aliceAccount.id)
    expect(aliceBalance).toEqual(BigInt(0))

    const bobBalance = await accounts.getBalance(bobAccount.id)
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

  test('reject response does not adjust the account balances', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '100' })
    const reject = IlpRejectFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reject = reject
    })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const aliceBalance = await accounts.getBalance(aliceAccount.id)
    expect(aliceBalance).toEqual(BigInt(100))

    const bobBalance = await accounts.getBalance(bobAccount.id)
    expect(bobBalance).toEqual(BigInt(0))
  })

  test('ignores 0 amount packets', async () => {
    const transferFundsSpy = jest.spyOn(accounts, 'transferFunds')
    const prepare = IlpPrepareFactory.build({ amount: '0' })
    const reject = IlpRejectFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reject = reject
    })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const aliceBalance = await accounts.getBalance(aliceAccount.id)
    expect(aliceBalance).toEqual(BigInt(100))

    const bobBalance = await accounts.getBalance(bobAccount.id)
    expect(bobBalance).toEqual(BigInt(0))

    expect(transferFundsSpy).toHaveBeenCalledTimes(0)
  })

  test('insufficient balance does not adjust the account balances', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '200' })
    const reject = IlpRejectFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reject = reject
    })

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      Errors.InsufficientLiquidityError
    )

    const aliceBalance = await accounts.getBalance(aliceAccount.id)
    expect(aliceBalance).toEqual(BigInt(100))

    const bobBalance = await accounts.getBalance(bobAccount.id)
    expect(bobBalance).toEqual(BigInt(0))
  })

  test('insufficient liquidity throws T04', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '100' })
    const fulfill = IlpFulfillFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.fulfill = fulfill
    })
    jest
      .spyOn(accounts, 'transferFunds')
      .mockImplementationOnce(
        async () => AccountTransferError.InsufficientLiquidity
      )

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      Errors.InsufficientLiquidityError
    )

    expect(next).toHaveBeenCalledTimes(0)

    const aliceBalance = await accounts.getBalance(aliceAccount.id)
    expect(aliceBalance).toEqual(BigInt(100))

    const bobBalance = await accounts.getBalance(bobAccount.id)
    expect(bobBalance).toEqual(BigInt(0))
  })
})
