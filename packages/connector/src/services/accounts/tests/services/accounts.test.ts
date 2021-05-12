import { randomInt } from 'crypto'

import { Transaction as KnexTransaction } from 'knex'
import { Model } from 'objection'
import { v4 as uuid } from 'uuid'

import { AccountsService } from '../../services/accounts'
import {
  toLiquidityId,
  toSettlementId,
  uuidToBigInt
} from '../../utils'
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
        uuidToBigInt(accountSettings.balanceId)
      ])
      expect(balances.length).toEqual(1)
      expect(balances[0].credit_reserved).toEqual(BigInt(0))
      expect(balances[0].credit_accepted).toEqual(BigInt(0))
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
        uuidToBigInt(accountSettings.balanceId)
      ])
      expect(balances.length).toEqual(1)
      expect(balances[0].credit_reserved).toEqual(BigInt(0))
      expect(balances[0].credit_accepted).toEqual(BigInt(0))
    })

    test('Auto-creates corresponding liquidity and settlement accounts', async (): Promise<void> => {
      const account = {
        accountId: uuid(),
        disabled: false,
        asset: randomAsset()
      }

      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          toLiquidityId(account.asset.code, account.asset.scale),
          toSettlementId(account.asset.code, account.asset.scale)
        ])
        expect(balances.length).toBe(0)
      }

      await accounts.createAccount(account)
      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          toLiquidityId(account.asset.code, account.asset.scale),
          toSettlementId(account.asset.code, account.asset.scale)
        ])
        expect(balances.length).toBe(2)
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
          toLiquidityId(account.asset.code, account.asset.scale),
          toSettlementId(account.asset.code, account.asset.scale)
        ])
        expect(balances.length).toBe(2)
      }
    })
  })
})
