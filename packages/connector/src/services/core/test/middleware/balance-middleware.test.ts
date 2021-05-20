import { createContext } from '../../utils'
import { RafikiContext, ZeroCopyIlpPrepare } from '../..'
import { createBalanceMiddleware } from '../../middleware'
import {
  AccountFactory,
  IlpPrepareFactory,
  IlpFulfillFactory,
  IlpRejectFactory,
  RafikiServicesFactory
} from '../../factories'

// TODO: make one peer to many account relationship
const aliceAccount = AccountFactory.build({ accountId: 'alice' })
const bobAccount = AccountFactory.build({ accountId: 'bob' })
const services = RafikiServicesFactory.build({})
const ctx = createContext<unknown, RafikiContext>()
ctx.accounts = {
  get incoming() {
    return aliceAccount
  },
  get outgoing() {
    return bobAccount
  }
}
ctx.services = services
const { accounts } = services

beforeEach(async () => {
  ctx.response.fulfill = undefined
  ctx.response.reject = undefined

  aliceAccount.balance.current = 0n
  bobAccount.balance.current = 0n

  await accounts.createAccount(aliceAccount)
  await accounts.createAccount(bobAccount)
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

    expect(
      (await accounts.getAccount(aliceAccount.accountId)).balance.current
    ).toEqual(BigInt(-100))
    expect(
      (await accounts.getAccount(bobAccount.accountId)).balance.current
    ).toEqual(BigInt(100))
  })

  test('reject response does not adjust the account balances', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '100' })
    const reject = IlpRejectFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reject = reject
    })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(
      (await accounts.getAccount(aliceAccount.accountId)).balance.current
    ).toEqual(BigInt(0))
    expect(
      (await accounts.getAccount(bobAccount.accountId)).balance.current
    ).toEqual(BigInt(0))
  })

  test('ignores 0 amount packets', async () => {
    const adjustBalancesSpy = jest.spyOn(accounts, 'adjustBalances')
    const prepare = IlpPrepareFactory.build({ amount: '0' })
    const reject = IlpRejectFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reject = reject
    })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(
      (await accounts.getAccount(aliceAccount.accountId)).balance.current
    ).toEqual(BigInt(0))
    expect(
      (await accounts.getAccount(bobAccount.accountId)).balance.current
    ).toEqual(BigInt(0))
    expect(adjustBalancesSpy).toHaveBeenCalledTimes(0)
  })
})
