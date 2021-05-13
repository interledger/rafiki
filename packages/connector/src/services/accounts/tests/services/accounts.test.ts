import { randomInt } from 'crypto'

import { Transaction as KnexTransaction } from 'knex'
import { Model } from 'objection'
import { v4 as uuid } from 'uuid'

import { AccountsService } from '../../services/accounts'
import { toLiquidityIds, toSettlementIds, uuidToBigInt } from '../../utils'
import { createTestApp, TestContainer } from '../helpers/app'
import { AppServices, Config, IlpAccountSettings } from '../..'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../../../accounts'

// Use unique assets as a workaround for not being able to reset
// Tigerbeetle between tests
function randomAsset() {
  const letters = []
  while (letters.length < 3) {
    letters.push(randomInt(65, 91))
  }
  return {
    code: String.fromCharCode(...letters),
    scale: randomInt(0, 256)
  }
}

describe('Accounts Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accounts: AccountsService
  let trx: KnexTransaction

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      accounts = appContainer.app.getAccounts()
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await appContainer.knex.transaction()
      Model.knex(trx)
    }
  )

  afterEach(
    async (): Promise<void> => {
      await trx.rollback()
      await trx.destroy()
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
    }
  )

  describe('Create Account', (): void => {
    test('Can create an account', async (): Promise<void> => {
      const accountId = uuid()
      const account = {
        accountId,
        disabled: false,
        asset: randomAsset()
      }
      const createdAccount = await accounts.createAccount(account)
      expect(createdAccount).toEqual(account)
      const accountSettings = await IlpAccountSettings.query().findById(accountId)
      const balances = await appContainer.tigerbeetle.lookupAccounts([
        uuidToBigInt(accountSettings.balanceId),
        uuidToBigInt(accountSettings.debtBalanceId),
        uuidToBigInt(accountSettings.trustlineBalanceId)
      ])
      expect(balances.length).toBe(3)
      balances.forEach((balance) => {
        expect(balance.credit_reserved).toEqual(BigInt(0))
        expect(balance.credit_accepted).toEqual(BigInt(0))
      })
    })

    test('Can create an account with all settings', async (): Promise<void> => {
      const accountId = uuid()
      const account = {
        accountId,
        disabled: false,
        parentAccountId: uuid(),
        asset: randomAsset(),
        http: {
          incoming: {
            authTokens: [uuid()],
            endpoint: '/incomingEndpoint',
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        },
        stream: {
          enabled: true
        },
        routing: {
          staticIlpAddress: 'g.rafiki/' + accountId
        }
      }
      const createdAccount = await accounts.createAccount(account)
      expect(createdAccount).toEqual(account)
      const accountSettings = await IlpAccountSettings.query().findById(accountId)
      const balances = await appContainer.tigerbeetle.lookupAccounts([
        uuidToBigInt(accountSettings.balanceId),
        uuidToBigInt(accountSettings.debtBalanceId),
        uuidToBigInt(accountSettings.trustlineBalanceId)
      ])
      expect(balances.length).toBe(3)
      balances.forEach((balance) => {
        expect(balance.credit_reserved).toEqual(BigInt(0))
        expect(balance.credit_accepted).toEqual(BigInt(0))
      })
    })

    test('Auto-creates corresponding liquidity and settlement accounts', async (): Promise<void> => {
      const account = {
        accountId: uuid(),
        disabled: false,
        asset: randomAsset()
      }

      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          ...Object.values(toLiquidityIds(account.asset.code, account.asset.scale)),
          ...Object.values(toSettlementIds(account.asset.code, account.asset.scale))
        ])
        expect(balances.length).toBe(0)
      }

      await accounts.createAccount(account)
      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          ...Object.values(toLiquidityIds(account.asset.code, account.asset.scale)),
          ...Object.values(toSettlementIds(account.asset.code, account.asset.scale))
        ])
        expect(balances.length).toBe(6)
        balances.forEach((balance) => {
          expect(balance.credit_reserved).toEqual(BigInt(0))
          expect(balance.credit_accepted).toEqual(BigInt(0))
        })
      }

      await accounts.createAccount({
        ...account,
        accountId: uuid()
      })

      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          ...Object.values(toLiquidityIds(account.asset.code, account.asset.scale)),
          ...Object.values(toSettlementIds(account.asset.code, account.asset.scale))
        ])
        expect(balances.length).toBe(6)
      }
    })
  })

  describe('Deposit liquidity', (): void => {
    test('Can deposit to liquidity account', async (): Promise<void> => {
      const { assetCode, assetScale } = randomAsset()
      const amount = BigInt(10)
      {
        await accounts.depositLiquidity(assetCode, assetScale, amount)
        const balance = await accounts.getLiquidityBalance(
          assetCode,
          assetScale
        )
        expect(balance).toEqual(amount)
        const settlementBalance = await accounts.getSettlementBalance(
          assetCode,
          assetScale
        )
        expect(settlementBalance).toEqual(-amount)
      }
      const amount2 = BigInt(5)
      {
        await accounts.depositLiquidity(assetCode, assetScale, amount2)
        const balance = await accounts.getLiquidityBalance(
          assetCode,
          assetScale
        )
        expect(balance).toEqual(amount + amount2)
        const settlementBalance = await accounts.getSettlementBalance(
          assetCode,
          assetScale
        )
        expect(settlementBalance).toEqual(-(amount + amount2))
      }
    })
  })

  describe('Withdraw liquidity', (): void => {
    test('Can withdraw liquidity account', async (): Promise<void> => {
      const { assetCode, assetScale } = randomAsset()
      const startingBalance = BigInt(10)
      await accounts.depositLiquidity(assetCode, assetScale, startingBalance)
      const amount = BigInt(5)
      {
        await accounts.withdrawLiquidity(assetCode, assetScale, amount)
        const balance = await accounts.getLiquidityBalance(
          assetCode,
          assetScale
        )
        expect(balance).toEqual(startingBalance - amount)
        const settlementBalance = await accounts.getSettlementBalance(
          assetCode,
          assetScale
        )
        expect(settlementBalance).toEqual(-(startingBalance - amount))
      }
      const amount2 = BigInt(5)
      {
        await accounts.withdrawLiquidity(assetCode, assetScale, amount2)
        const balance = await accounts.getLiquidityBalance(
          assetCode,
          assetScale
        )
        expect(balance).toEqual(startingBalance - amount - amount2)
        const settlementBalance = await accounts.getSettlementBalance(
          assetCode,
          assetScale
        )
        expect(settlementBalance).toEqual(-(startingBalance - amount - amount2))
      }
    })

    test.skip("Can't withdraw more than the balance", async (): Promise<void> => {
      const { assetCode, assetScale } = randomAsset()
      const startingBalance = BigInt(5)
      await accounts.depositLiquidity(assetCode, assetScale, startingBalance)
      const amount = BigInt(10)
      await accounts.withdrawLiquidity(assetCode, assetScale, amount)
      const balance = await accounts.getLiquidityBalance(assetCode, assetScale)
      expect(balance).toEqual(startingBalance)
      const settlementBalance = await accounts.getSettlementBalance(
        assetCode,
        assetScale
      )
      expect(settlementBalance).toEqual(-startingBalance)
    })
  })
})
