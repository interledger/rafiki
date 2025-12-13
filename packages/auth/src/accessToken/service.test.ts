import nock from 'nock'
import { v4 } from 'uuid'
import assert from 'assert'

import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { Grant, GrantState, GrantFinalization } from '../grant/model'
import { AccessToken } from './model'
import { AccessTokenService } from './service'
import { Access } from '../access/model'
import { generateToken } from '../shared/utils'
import {
  AccessType,
  AccessAction,
  AccessItem
} from '@interledger/open-payments'
import { generateBaseGrant } from '../tests/grant'
import { TransactionOrKnex } from 'objection'
import { Tenant } from '../tenant/model'
import { generateTenant } from '../tests/tenant'

describe('Access Token Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let trx: TransactionOrKnex
  let accessTokenService: AccessTokenService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    accessTokenService = await deps.use('accessTokenService')
    trx = appContainer.knex
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  const BASE_ACCESS = {
    type: AccessType.OutgoingPayment,
    actions: [AccessAction.Read, AccessAction.Create],
    identifier: `https://example.com/${v4()}`,
    limits: {
      receiver: 'https://wallet.com/alice',
      debitAmount: {
        value: '400',
        assetCode: 'USD',
        assetScale: 2
      }
    }
  }

  const BASE_TOKEN = {
    expiresIn: 3600
  }

  let grant: Grant
  beforeEach(async (): Promise<void> => {
    const tenant = await Tenant.query(trx).insertAndFetch(generateTenant())
    grant = await Grant.query(trx).insertAndFetch(
      generateBaseGrant({ state: GrantState.Approved, tenantId: tenant.id })
    )
    grant.access = [
      await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
    ]
  })

  describe('Create', (): void => {
    test('Can create access token', async (): Promise<void> => {
      const accessToken = await accessTokenService.create(grant.id)
      expect(accessToken).toMatchObject({
        grantId: grant.id,
        managementId: expect.any(String),
        value: expect.any(String)
      })
    })
  })

  describe('getByManagementId', (): void => {
    let accessToken: AccessToken
    beforeEach(async (): Promise<void> => {
      accessToken = await AccessToken.query(trx).insert({
        value: 'test-access-token',
        managementId: v4(),
        grantId: grant.id,
        expiresIn: 1234
      })
    })

    test('Can get an access token by its managementId', async (): Promise<void> => {
      const retrievedGrant = await Grant.query(trx).findById(grant.id)
      await expect(
        accessTokenService.getByManagementId(accessToken.managementId)
      ).resolves.toMatchObject({
        ...accessToken,
        revokedAt: null,
        grant: retrievedGrant
      })
    })

    test('Cannot get an access token that does not exist', async (): Promise<void> => {
      await expect(AccessToken.query().findById(v4())).resolves.toBeUndefined()
      await expect(
        accessTokenService.getByManagementId(v4())
      ).resolves.toBeUndefined()
    })

    test('Cannot get rotated access token by managementId', async (): Promise<void> => {
      await accessTokenService.rotate(accessToken.id)
      await expect(
        accessTokenService.getByManagementId(accessToken.managementId)
      ).resolves.toBeUndefined()
    })
  })

  describe('Introspect', (): void => {
    let accessToken: AccessToken
    const outgoingPaymentAccess: AccessItem = {
      type: 'outgoing-payment',
      actions: ['create', 'read'],
      identifier: BASE_ACCESS.identifier,
      limits: BASE_ACCESS.limits
    }

    beforeEach(async (): Promise<void> => {
      accessToken = await AccessToken.query(trx).insert({
        value: 'test-access-token',
        managementId: v4(),
        grantId: grant.id,
        expiresIn: 1234
      })
    })

    test('Can introspect active token', async (): Promise<void> => {
      await expect(
        accessTokenService.introspect(accessToken.value)
      ).resolves.toEqual({ grant, access: [] })
    })

    test('Can introspect expired token', async (): Promise<void> => {
      const tokenCreatedDate = new Date(accessToken.createdAt)
      const now = new Date(
        tokenCreatedDate.getTime() + (accessToken.expiresIn + 1) * 1000
      )
      jest.useFakeTimers({ now })
      await expect(
        accessTokenService.introspect(accessToken.value)
      ).resolves.toBeUndefined()
    })

    test('Can introspect active token for revoked grant', async (): Promise<void> => {
      await grant.$query(trx).patch({
        state: GrantState.Finalized,
        finalizationReason: GrantFinalization.Revoked
      })
      await expect(
        accessTokenService.introspect(accessToken.value)
      ).resolves.toBeUndefined()
    })

    test('Can introspect active token with correct access', async (): Promise<void> => {
      await expect(
        accessTokenService.introspect(accessToken.value, [
          outgoingPaymentAccess
        ])
      ).resolves.toEqual({ grant, access: [grant.access?.[0]] })
    })

    test('Can introspect active token with partial access actions', async (): Promise<void> => {
      const access: AccessItem = {
        ...outgoingPaymentAccess,
        actions: [outgoingPaymentAccess.actions[0]]
      }
      await expect(
        accessTokenService.introspect(accessToken.value, [access])
      ).resolves.toEqual({ grant, access: [grant.access?.[0]] })
    })

    test('Introspection only returns requested access', async (): Promise<void> => {
      const tenant = await Tenant.query(trx).insertAndFetch(generateTenant())
      const grantWithTwoAccesses = await Grant.query(trx).insertAndFetch(
        generateBaseGrant({ state: GrantState.Approved, tenantId: tenant.id })
      )
      grantWithTwoAccesses.access = [
        await Access.query(trx).insertAndFetch({
          grantId: grantWithTwoAccesses.id,
          ...BASE_ACCESS
        })
      ]
      const secondAccessItem: AccessItem = {
        type: 'quote',
        actions: ['create', 'read']
      }
      const dbSecondAccess = await Access.query(trx).insertAndFetch({
        grantId: grantWithTwoAccesses.id,
        ...secondAccessItem
      })

      grantWithTwoAccesses.access.push(dbSecondAccess)

      const accessTokenForTwoAccessGrant = await AccessToken.query(trx).insert({
        value: 'test-access-token-two-access',
        managementId: v4(),
        grantId: grantWithTwoAccesses.id,
        expiresIn: 1234
      })

      await expect(
        accessTokenService.introspect(accessTokenForTwoAccessGrant.value, [
          secondAccessItem
        ])
      ).resolves.toEqual({
        grant: grantWithTwoAccesses,
        access: [dbSecondAccess]
      })
    })

    test('Cannot introspect non-existing token', async (): Promise<void> => {
      expect(accessTokenService.introspect(v4())).resolves.toBeUndefined()
    })

    test('Cannot introspect rotated access token', async (): Promise<void> => {
      await accessTokenService.rotate(accessToken.id)

      await expect(
        accessTokenService.introspect(accessToken.value)
      ).resolves.toBeUndefined()
    })

    test('Can introspect token with incorrect access, but returns empty access field', async (): Promise<void> => {
      const access: AccessItem = {
        ...outgoingPaymentAccess,
        actions: ['list']
      }
      await expect(
        accessTokenService.introspect(accessToken.value, [access])
      ).resolves.toMatchObject({ grant, access: [] })
    })
  })

  describe('Revoke', (): void => {
    let tenant: Tenant
    let grant: Grant
    let token: AccessToken
    beforeEach(async (): Promise<void> => {
      tenant = await Tenant.query(trx).insertAndFetch(generateTenant())
      grant = await Grant.query(trx).insertAndFetch(
        generateBaseGrant({
          tenantId: tenant.id,
          state: GrantState.Finalized,
          finalizationReason: GrantFinalization.Issued
        })
      )

      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN,
        value: generateToken(),
        managementId: v4()
      })
    })

    describe('Revoke by token id', (): void => {
      test('Can revoke un-expired token', async (): Promise<void> => {
        await token.$query(trx).patch({ expiresIn: 1000000 })
        await expect(accessTokenService.revoke(token.id)).resolves.toEqual({
          ...token,
          revokedAt: expect.any(Date),
          updatedAt: expect.any(Date)
        })
      })
      test('Can revoke even if token has already expired', async (): Promise<void> => {
        await token.$query(trx).patch({ expiresIn: -1 })
        await expect(accessTokenService.revoke(token.id)).resolves.toEqual({
          ...token,
          revokedAt: expect.any(Date),
          updatedAt: expect.any(Date)
        })
      })
      test('Can revoke even if token has already been revoked', async (): Promise<void> => {
        await token.$query(trx).delete()
        await expect(
          accessTokenService.revoke(token.id)
        ).resolves.toBeUndefined()
        await expect(
          AccessToken.query(trx).findById(token.id)
        ).resolves.toBeUndefined()
      })

      test('Cannot revoke rotated access token', async (): Promise<void> => {
        await accessTokenService.rotate(token.id)

        await expect(
          accessTokenService.revoke(token.id)
        ).resolves.toBeUndefined()
      })
    })
    describe('Revoke by grant id', (): void => {
      test('Can revoke un-expired token', async (): Promise<void> => {
        await token.$query(trx).patch({ expiresIn: 1000000 })
        await expect(
          accessTokenService.revokeByGrantId(grant.id)
        ).resolves.toEqual(1)
        await expect(
          AccessToken.query(trx).findById(token.id)
        ).resolves.toEqual({
          ...token,
          revokedAt: expect.any(Date),
          updatedAt: expect.any(Date)
        })
      })
      test('Can revoke even if token has already expired', async (): Promise<void> => {
        await token.$query(trx).patch({ expiresIn: -1 })
        await expect(
          accessTokenService.revokeByGrantId(grant.id)
        ).resolves.toEqual(1)
        await expect(
          AccessToken.query(trx).findById(token.id)
        ).resolves.toEqual({
          ...token,
          revokedAt: expect.any(Date),
          updatedAt: expect.any(Date)
        })
      })
      test('Can revoke even if token has already been revoked', async (): Promise<void> => {
        await token.$query(trx).delete()
        await expect(
          accessTokenService.revokeByGrantId(grant.id)
        ).resolves.toEqual(0)
        await expect(
          AccessToken.query(trx).findById(token.id)
        ).resolves.toBeUndefined()
      })

      test('Cannot revoke rotated access token', async (): Promise<void> => {
        await accessTokenService.rotate(token.id)

        await expect(
          accessTokenService.revokeByGrantId(token.id)
        ).resolves.toEqual(0)
      })
    })
  })

  describe('Rotate', (): void => {
    let grant: Grant
    let token: AccessToken
    let originalTokenValue: string
    beforeEach(async (): Promise<void> => {
      const tenant = await Tenant.query(trx).insertAndFetch(generateTenant())
      grant = await Grant.query(trx).insertAndFetch(
        generateBaseGrant({
          tenantId: tenant.id,
          state: GrantState.Finalized,
          finalizationReason: GrantFinalization.Issued
        })
      )
      await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN,
        value: generateToken(),
        managementId: v4()
      })
      originalTokenValue = token.value
    })

    test('Can rotate un-expired token', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: 1000000 })
      const result = await accessTokenService.rotate(token.id)
      assert.ok(result)
      expect(result.value).not.toBe(originalTokenValue)
    })
    test('Can rotate expired token', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: -1 })
      const result = await accessTokenService.rotate(token.id)
      assert.ok(result)
      const rotatedToken = await AccessToken.query(trx).findOne({
        managementId: result.managementId
      })
      assert.ok(rotatedToken)
      expect(rotatedToken?.value).not.toBe(originalTokenValue)
    })

    test('Cannot rotate token with incorrect id', async (): Promise<void> => {
      await expect(accessTokenService.rotate(v4())).resolves.toBeUndefined()
    })
  })
})
