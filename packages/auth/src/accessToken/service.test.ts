import { faker } from '@faker-js/faker'
import nock from 'nock'
import { Knex } from 'knex'
import { v4 } from 'uuid'
import assert from 'assert'

import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { FinishMethod, Grant, GrantState, StartMethod } from '../grant/model'
import { AccessToken } from './model'
import { AccessTokenService } from './service'
import { Access } from '../access/model'
import { generateNonce, generateToken } from '../shared/utils'
import { AccessType, AccessAction } from 'open-payments'

describe('Access Token Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let trx: Knex.Transaction
  let accessTokenService: AccessTokenService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    accessTokenService = await deps.use('accessTokenService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  const CLIENT = faker.internet.url()

  const BASE_GRANT = {
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com/finish',
    clientNonce: generateNonce(),
    client: CLIENT
  }

  const BASE_ACCESS = {
    type: AccessType.OutgoingPayment,
    actions: [AccessAction.Read, AccessAction.Create],
    identifier: `https://example.com/${v4()}`,
    limits: {
      receiver: 'https://wallet.com/alice',
      sendAmount: {
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
  let token: AccessToken
  beforeEach(async (): Promise<void> => {
    grant = await Grant.query(trx).insertAndFetch({
      ...BASE_GRANT,
      continueToken: generateToken(),
      continueId: v4(),
      interactId: v4(),
      interactRef: generateNonce(),
      interactNonce: generateNonce()
    })
    grant.access = [
      await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
    ]
    token = await AccessToken.query(trx).insertAndFetch({
      grantId: grant.id,
      ...BASE_TOKEN,
      value: generateToken(),
      managementId: v4()
    })
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

  describe('Get', (): void => {
    let accessToken: AccessToken
    beforeEach(async (): Promise<void> => {
      accessToken = await AccessToken.query(trx).insert({
        value: 'test-access-token',
        managementId: v4(),
        grantId: grant.id,
        expiresIn: 1234
      })
    })

    test('Can get an access token by its value', async (): Promise<void> => {
      const fetchedToken = await accessTokenService.get(accessToken.value)
      assert.ok(fetchedToken)
      expect(fetchedToken.value).toEqual(accessToken.value)
      expect(fetchedToken.managementId).toEqual(accessToken.managementId)
      expect(fetchedToken.grantId).toEqual(accessToken.grantId)
    })

    test('Can get an access token by its managementId', async (): Promise<void> => {
      const fetchedToken = await accessTokenService.getByManagementId(
        accessToken.managementId
      )
      assert.ok(fetchedToken)
      expect(fetchedToken.value).toEqual(accessToken.value)
      expect(fetchedToken.managementId).toEqual(accessToken.managementId)
      expect(fetchedToken.grantId).toEqual(accessToken.grantId)
    })

    test('Cannot get an access token that does not exist', async (): Promise<void> => {
      await expect(accessTokenService.get(v4())).resolves.toBeUndefined()
      await expect(
        accessTokenService.getByManagementId(v4())
      ).resolves.toBeUndefined()
    })
  })

  describe('Introspect', (): void => {
    test('Can introspect active token', async (): Promise<void> => {
      await expect(accessTokenService.introspect(token.value)).resolves.toEqual(
        grant
      )
    })

    test('Can introspect expired token', async (): Promise<void> => {
      const tokenCreatedDate = new Date(token.createdAt)
      const now = new Date(
        tokenCreatedDate.getTime() + (token.expiresIn + 1) * 1000
      )
      jest.useFakeTimers({ now })
      await expect(
        accessTokenService.introspect(token.value)
      ).resolves.toBeUndefined()
    })

    test('Can introspect active token for revoked grant', async (): Promise<void> => {
      await grant.$query(trx).patch({ state: GrantState.Revoked })
      await expect(
        accessTokenService.introspect(token.value)
      ).resolves.toBeUndefined()
    })

    test('Cannot introspect non-existing token', async (): Promise<void> => {
      expect(accessTokenService.introspect('uuid')).resolves.toBeUndefined()
    })
  })

  describe('Revoke', (): void => {
    let grant: Grant
    let token: AccessToken
    beforeEach(async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch({
        ...BASE_GRANT,
        continueToken: generateToken(),
        continueId: v4(),
        interactId: v4(),
        interactRef: generateNonce(),
        interactNonce: generateNonce()
      })
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN,
        value: generateToken(),
        managementId: v4()
      })
    })
    test('Can revoke un-expired token', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: 1000000 })
      const result = await accessTokenService.revoke(
        token.managementId,
        token.value
      )
      expect(result).toBeUndefined()
      await expect(
        AccessToken.query(trx).findById(token.id)
      ).resolves.toBeUndefined()
    })
    test('Can revoke even if token has already expired', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: -1 })
      const result = await accessTokenService.revoke(
        token.managementId,
        token.value
      )
      expect(result).toBeUndefined()
      await expect(
        AccessToken.query(trx).findById(token.id)
      ).resolves.toBeUndefined()
    })
    test('Can revoke even if token has already been revoked', async (): Promise<void> => {
      await token.$query(trx).delete()
      const result = await accessTokenService.revoke(token.id, token.value)
      expect(result).toBeUndefined()
      await expect(
        AccessToken.query(trx).findById(token.id)
      ).resolves.toBeUndefined()
    })
  })

  describe('Rotate', (): void => {
    let grant: Grant
    let token: AccessToken
    let originalTokenValue: string
    beforeEach(async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch({
        ...BASE_GRANT,
        continueToken: generateToken(),
        continueId: v4(),
        interactId: v4(),
        interactRef: generateNonce(),
        interactNonce: generateNonce()
      })
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
      const result = await accessTokenService.rotate(
        token.managementId,
        token.value
      )
      assert.ok(result)
      expect(result.value).not.toBe(originalTokenValue)
    })
    test('Can rotate expired token', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: -1 })
      const result = await accessTokenService.rotate(
        token.managementId,
        token.value
      )
      assert.ok(result)
      const rotatedToken = await AccessToken.query(trx).findOne({
        managementId: result.managementId
      })
      assert.ok(rotatedToken)
      expect(rotatedToken?.value).not.toBe(originalTokenValue)
    })
    test('Cannot rotate token with incorrect management id', async (): Promise<void> => {
      const result = await accessTokenService.rotate(v4(), token.value)
      expect(result).toBeUndefined()
    })
    test('Cannot rotate token with incorrect value', async (): Promise<void> => {
      const result = await accessTokenService.rotate(token.managementId, v4())
      expect(result).toBeUndefined()
    })
  })
})
