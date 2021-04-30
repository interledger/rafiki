import { createContext } from '../../utils'
import {
  RafikiContext,
  InMemoryAccountsService,
  ZeroCopyIlpPrepare
} from '../..'
import {
  createIncomingBalanceMiddleware,
  createOutgoingBalanceMiddleware
} from '../../middleware'
import {
  AccountInfoFactory,
  IlpPrepareFactory,
  IlpFulfillFactory,
  IlpRejectFactory
} from '../../factories'
import { RafikiServicesFactory } from '../../factories/test'

// TODO: make one peer to many account relationship
const aliceAccountInfo = AccountInfoFactory.build({
  id: 'alice',
  peerId: 'alice',
  maximumPayable: BigInt(1000)
})
const bobAccountInfo = AccountInfoFactory.build({
  id: 'bob',
  peerId: 'bob',
  maximumReceivable: BigInt(1000)
})
const accounts = new InMemoryAccountsService()
const services = RafikiServicesFactory.build({ accounts })
const ctx = createContext<unknown, RafikiContext>()
ctx.accounts = {
  get incoming() {
    return accounts.get('alice')
  },
  get outgoing() {
    return accounts.get('bob')
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

describe('Incoming Balance Middleware', function () {
  const middleware = createIncomingBalanceMiddleware()
  it('fulfill response increments the balanceReceivable for the incoming peer', async () => {
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
      BigInt(0)
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
    const adjustReceivablesSpy = jest.spyOn(accounts, 'adjustBalanceReceivable')
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
    expect(adjustReceivablesSpy).toHaveBeenCalledTimes(0)
  })
})

describe('Outgoing Balance Middleware', function () {
  const middleware = createOutgoingBalanceMiddleware()
  it('fulfill response increments the balancePayable for the outgoing peer', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '100' })
    const fulfill = IlpFulfillFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.fulfill = fulfill
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
      BigInt(100)
    )
  })

  it('reject response does not adjust the account balances', async () => {
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
    const adjustPayablesSpy = jest.spyOn(accounts, 'adjustBalancePayable')
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
    expect(adjustPayablesSpy).toHaveBeenCalledTimes(0)
  })
})
