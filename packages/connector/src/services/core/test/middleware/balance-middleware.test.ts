import { createContext } from '../../utils'
import {
  RafikiContext,
  InMemoryAccountsService,
  ZeroCopyIlpPrepare
} from '../..'
import { createBalanceMiddleware } from '../../middleware'
import {
  AccountInfoFactory,
  IlpPrepareFactory,
  IlpFulfillFactory,
  IlpRejectFactory,
  RafikiServicesFactory
} from '../../factories'

// TODO: make one peer to many account relationship
const aliceAccountInfo = AccountInfoFactory.build({
  id: 'alice'
})
const bobAccountInfo = AccountInfoFactory.build({
  id: 'bob'
})
const accounts = new InMemoryAccountsService()
const services = RafikiServicesFactory.build({ accounts })
const ctx = createContext<unknown, RafikiContext>()
ctx.accounts = {
  get incomingId(): string {
    return 'alice'
  },
  get outgoingId(): string {
    return 'bob'
  }
}
ctx.services = services

beforeEach(() => {
  ctx.response.fulfill = undefined
  ctx.response.reject = undefined

  accounts.remove('alice')
  accounts.remove('bob')
  accounts.add(aliceAccountInfo)
  accounts.add(bobAccountInfo)
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

    expect((await accounts.get(aliceAccountInfo.id)).balanceReceivable).toEqual(
      BigInt(100)
    )
    expect((await accounts.get(aliceAccountInfo.id)).balancePayable).toEqual(
      BigInt(0)
    )
    expect((await accounts.get(bobAccountInfo.id)).balanceReceivable).toEqual(
      BigInt(0)
    )
    expect((await accounts.get(bobAccountInfo.id)).balancePayable).toEqual(
      BigInt(100)
    )
  })

  test('reject response does not adjust the account balances', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '100' })
    const reject = IlpRejectFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reject = reject
    })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect((await accounts.get(aliceAccountInfo.id)).balanceReceivable).toEqual(
      BigInt(0)
    )
    expect((await accounts.get(aliceAccountInfo.id)).balancePayable).toEqual(
      BigInt(0)
    )
    expect((await accounts.get(bobAccountInfo.id)).balanceReceivable).toEqual(
      BigInt(0)
    )
    expect((await accounts.get(bobAccountInfo.id)).balancePayable).toEqual(
      BigInt(0)
    )
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

    expect((await accounts.get(aliceAccountInfo.id)).balanceReceivable).toEqual(
      BigInt(0)
    )
    expect((await accounts.get(aliceAccountInfo.id)).balancePayable).toEqual(
      BigInt(0)
    )
    expect((await accounts.get(bobAccountInfo.id)).balanceReceivable).toEqual(
      BigInt(0)
    )
    expect((await accounts.get(bobAccountInfo.id)).balancePayable).toEqual(
      BigInt(0)
    )
    expect(adjustBalancesSpy).toHaveBeenCalledTimes(0)
  })
})
