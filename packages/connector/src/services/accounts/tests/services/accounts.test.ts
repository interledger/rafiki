import { Transaction as KnexTransaction } from 'knex'
import { Model } from 'objection'
import { v4 as uuid } from 'uuid'

import { AccountsService } from '../../services/accounts'
import { uuidToBigInt } from '../../utils'
import { createTestApp, TestContainer } from '../helpers/app'
import { AppServices, Config, IlpAccountSettings } from '../..'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../../../accounts'

describe.only('Accounts Service', (): void => {
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
        asset: {
          code: 'USD',
          scale: 9
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

    test('Can create an account with all settings', async (): Promise<void> => {
      const accountId = uuid()
      const account = {
        accountId,
        disabled: false,
        parentAccountId: uuid(),
        asset: {
          code: 'USD',
          scale: 9
        },
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
  })
})
