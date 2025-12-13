import { v4 } from 'uuid'
import { IocContract } from '@adonisjs/fold'
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
import { TransactionOrKnex } from 'objection'
import { Tenant } from '../tenant/model'
import { generateTenant } from '../tests/tenant'

describe('Access utilities', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let trx: TransactionOrKnex
  let identifier: string
  let grant: Grant
  let grantAccessItem: Access
  let tenant: Tenant

  const receiver: string =
    'https://wallet.com/alice/incoming-payments/12341234-1234-1234-1234-123412341234'

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    trx = appContainer.knex
  })

  beforeEach(async (): Promise<void> => {
    identifier = `https://example.com/${v4()}`
    tenant = await Tenant.query(trx).insertAndFetch(generateTenant())
    grant = await Grant.query(trx).insertAndFetch({
      state: GrantState.Processing,
      startMethod: [StartMethod.Redirect],
      continueToken: generateToken(),
      continueId: v4(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com/finish',
      clientNonce: generateNonce(),
      client: faker.internet.url({ appendSlash: false }),
      tenantId: tenant.id
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
    await truncateTables(deps)
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

  test('Can compare an access item on a grant and an access item from a request with different action ordering', async (): Promise<void> => {
    const grantAccessItemSuperAction = await Access.query(trx).insertAndFetch({
      grantId: grant.id,
      type: AccessType.OutgoingPayment,
      actions: [AccessAction.Create, AccessAction.ReadAll, AccessAction.List],
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
      actions: ['read', 'list', 'create'],
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

  test('Can compare an access item on a grant without an identifier with a request with an identifier', async (): Promise<void> => {
    const grantAccessItemSuperAction = await Access.query(trx).insertAndFetch({
      grantId: grant.id,
      type: AccessType.IncomingPayment,
      actions: [AccessAction.ReadAll],
      identifier: undefined
    })

    const requestAccessItem: AccessItem = {
      type: 'incoming-payment',
      actions: [AccessAction.ReadAll],
      identifier
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
      state: GrantState.Processing,
      startMethod: [StartMethod.Redirect],
      continueToken: generateToken(),
      continueId: v4(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com/finish',
      clientNonce: generateNonce(),
      client: faker.internet.url({ appendSlash: false }),
      tenantId: tenant.id
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

  test('access comparison fails if identifier mismatch', async (): Promise<void> => {
    const grantAccessItemSuperAction = await Access.query(trx).insertAndFetch({
      grantId: grant.id,
      type: AccessType.IncomingPayment,
      actions: [AccessAction.ReadAll],
      identifier
    })

    const requestAccessItem: AccessItem = {
      type: 'incoming-payment',
      actions: [AccessAction.ReadAll],
      identifier: `https://example.com/${v4()}`
    }

    expect(
      compareRequestAndGrantAccessItems(
        requestAccessItem,
        toOpenPaymentsAccess(grantAccessItemSuperAction)
      )
    ).toBe(false)
  })

  test('access comparison fails if type mismatch', async (): Promise<void> => {
    const grantAccessItemSuperAction = await Access.query(trx).insertAndFetch({
      grantId: grant.id,
      type: AccessType.Quote,
      actions: [AccessAction.Read]
    })

    const requestAccessItem: AccessItem = {
      type: 'incoming-payment',
      actions: [AccessAction.Read]
    }

    expect(
      compareRequestAndGrantAccessItems(
        requestAccessItem,
        toOpenPaymentsAccess(grantAccessItemSuperAction)
      )
    ).toBe(false)
  })
})
