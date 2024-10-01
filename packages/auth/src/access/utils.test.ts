import { v4 } from 'uuid'
import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import { faker } from '@faker-js/faker'
import {
  AccessItem,
  AccessType,
  AccessAction
} from '@interledger/open-payments'

import { AppServices } from '../app'
import { Access, toOpenPaymentsAccess } from './model'
import { Grant, GrantState, StartMethod, FinishMethod } from '../grant/model'
import { initIocContainer } from '..'
import { Config } from '../config/app'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { generateToken, generateNonce } from '../shared/utils'
import { compareRequestAndGrantAccessItems } from './utils'
import { Tenant } from '../tenants/model'

describe('Access utilities', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let trx: Knex.Transaction
  let identifier: string
  let grant: Grant
  let grantAccessItem: Access
  let tenantId: string

  const receiver: string =
    'https://wallet.com/alice/incoming-payments/12341234-1234-1234-1234-123412341234'

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  beforeEach(async (): Promise<void> => {
    tenantId = (
      await Tenant.query(trx).insertAndFetch({
        id: v4(),
        idpConsentEndpoint: faker.internet.url(),
        idpSecret: 'test-secret'
      })
    ).id
    identifier = `https://example.com/${v4()}`
    grant = await Grant.query(trx).insertAndFetch({
      tenantId,
      state: GrantState.Processing,
      startMethod: [StartMethod.Redirect],
      continueToken: generateToken(),
      continueId: v4(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com/finish',
      clientNonce: generateNonce(),
      client: faker.internet.url({ appendSlash: false })
    })

    grantAccessItem = await Access.query(trx).insertAndFetch({
      grantId: grant.id,
      type: AccessType.OutgoingPayment,
      actions: [AccessAction.Read, AccessAction.Create, AccessAction.List],
      identifier,
      limits: {
        receiver,
        debitAmount: {
          value: '400',
          assetCode: 'USD',
          assetScale: 2
        }
      }
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  test('Can compare an access item on a grant and an access item from a request', async (): Promise<void> => {
    const requestAccessItem: AccessItem = {
      type: 'outgoing-payment',
      actions: ['create', 'read', 'list'],
      identifier,
      limits: {
        receiver,
        debitAmount: {
          value: '400',
          assetCode: 'USD',
          assetScale: 2
        }
      }
    }

    expect(
      compareRequestAndGrantAccessItems(
        requestAccessItem,
        toOpenPaymentsAccess(grantAccessItem)
      )
    ).toBe(true)
  })

  test('Can compare an access item on a grant and an access item from a request with partial actions', async (): Promise<void> => {
    const requestAccessItem: AccessItem = {
      type: 'outgoing-payment',
      actions: ['read'],
      identifier,
      limits: {
        receiver,
        debitAmount: {
          value: '400',
          assetCode: 'USD',
          assetScale: 2
        }
      }
    }

    expect(
      compareRequestAndGrantAccessItems(
        requestAccessItem,
        toOpenPaymentsAccess(grantAccessItem)
      )
    ).toBe(true)
  })

  test('Can compare an access item on a grant and an access item from a request with a subaction of the grant', async (): Promise<void> => {
    const grantAccessItemSuperAction = await Access.query(trx).insertAndFetch({
      grantId: grant.id,
      type: AccessType.OutgoingPayment,
      actions: [AccessAction.ReadAll],
      identifier,
      limits: {
        receiver,
        debitAmount: {
          value: '400',
          assetCode: 'USD',
          assetScale: 2
        }
      }
    })

    const requestAccessItem: AccessItem = {
      type: 'outgoing-payment',
      actions: ['read'],
      identifier,
      limits: {
        receiver,
        debitAmount: {
          value: '400',
          assetCode: 'USD',
          assetScale: 2
        }
      }
    }

    expect(
      compareRequestAndGrantAccessItems(
        requestAccessItem,
        toOpenPaymentsAccess(grantAccessItemSuperAction)
      )
    ).toBe(true)
  })

  test('access comparison fails if grant action items are insufficient', async (): Promise<void> => {
    const identifier = `https://example.com/${v4()}`
    const receiver =
      'https://wallet.com/alice/incoming-payments/12341234-1234-1234-1234-123412341234'
    const requestAccessItem: AccessItem = {
      type: 'outgoing-payment',
      actions: ['create', 'read', 'list'],
      identifier,
      limits: {
        receiver,
        debitAmount: {
          value: '400',
          assetCode: 'USD',
          assetScale: 2
        }
      }
    }

    const grant = await Grant.query(trx).insertAndFetch({
      tenantId,
      state: GrantState.Processing,
      startMethod: [StartMethod.Redirect],
      continueToken: generateToken(),
      continueId: v4(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com/finish',
      clientNonce: generateNonce(),
      client: faker.internet.url({ appendSlash: false })
    })

    const grantAccessItem = await Access.query(trx).insertAndFetch({
      grantId: grant.id,
      type: AccessType.OutgoingPayment,
      actions: [AccessAction.Read, AccessAction.Create],
      identifier,
      limits: {
        receiver,
        debitAmount: {
          value: '400',
          assetCode: 'USD',
          assetScale: 2
        }
      }
    })

    expect(
      compareRequestAndGrantAccessItems(
        requestAccessItem,
        toOpenPaymentsAccess(grantAccessItem)
      )
    ).toBe(false)
  })
})
