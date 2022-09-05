import nock from 'nock'
import assert from 'assert'
import { Knex } from 'knex'
import crypto from 'crypto'
import { v4 } from 'uuid'

import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer, JWKWithRequired } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { FinishMethod, Grant, GrantState, StartMethod } from '../grant/model'
import { AccessType, Action } from '../access/types'
import { AccessToken } from './model'
import { AccessTokenService } from './service'
import { Access } from '../access/model'
import { generateTestKeys, TEST_CLIENT } from '../tests/signature'
import { ClientKey } from '../client/service'

const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'
const TEST_KID_PATH = '/keys/test-key'

describe('Access Token Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let trx: Knex.Transaction
  let accessTokenService: AccessTokenService
  let testJwk: JWKWithRequired

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    accessTokenService = await deps.use('accessTokenService')

    const keys = await generateTestKeys()
    testJwk = keys.publicKey
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  const BASE_GRANT = {
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com/finish',
    clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
    clientKeyId: KEY_REGISTRY_ORIGIN + TEST_KID_PATH
  }

  const BASE_ACCESS = {
    type: AccessType.OutgoingPayment,
    actions: [Action.Read, Action.Create],
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
  let access: Access
  let token: AccessToken
  beforeEach(async (): Promise<void> => {
    grant = await Grant.query(trx).insertAndFetch({
      ...BASE_GRANT,
      continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
      continueId: v4(),
      interactId: v4(),
      interactRef: crypto.randomBytes(8).toString('hex').toUpperCase(),
      interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
    })
    access = await Access.query(trx).insertAndFetch({
      grantId: grant.id,
      ...BASE_ACCESS
    })
    token = await AccessToken.query(trx).insertAndFetch({
      grantId: grant.id,
      ...BASE_TOKEN,
      value: crypto.randomBytes(8).toString('hex').toUpperCase(),
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
      expect(fetchedToken.value).toEqual(accessToken.value)
      expect(fetchedToken.managementId).toEqual(accessToken.managementId)
      expect(fetchedToken.grantId).toEqual(accessToken.grantId)
    })

    test('Can get an access token by its managementId', async (): Promise<void> => {
      const fetchedToken = await accessTokenService.getByManagementId(
        accessToken.managementId
      )
      expect(fetchedToken.value).toEqual(accessToken.value)
      expect(fetchedToken.managementId).toEqual(accessToken.managementId)
      expect(fetchedToken.grantId).toEqual(accessToken.grantId)
    })
  })

  describe('Introspect', (): void => {
    test('Can introspect active token', async (): Promise<void> => {
      const clientId = crypto
        .createHash('sha256')
        .update(TEST_CLIENT.id)
        .digest('hex')

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          client: TEST_CLIENT,
          jwk: testJwk
        } as ClientKey)

      const introspection = await accessTokenService.introspect(token.value)
      assert.ok(introspection)
      expect(introspection.active).toEqual(true)
      expect(introspection).toMatchObject({
        ...grant,
        access: [access],
        key: { proof: 'httpsig', jwk: testJwk },
        clientId
      })
      scope.isDone()
    })

    test('Can introspect expired token', async (): Promise<void> => {
      const now = new Date(new Date().getTime() + 4000)
      jest.useFakeTimers()
      jest.setSystemTime(now)
      const introspection = await accessTokenService.introspect(token.value)
      expect(introspection).toEqual({ active: false })
    })

    test('Can introspect active token for revoked grant', async (): Promise<void> => {
      await grant.$query(trx).patch({ state: GrantState.Revoked })
      const introspection = await accessTokenService.introspect(token.value)
      expect(introspection).toEqual({ active: false })
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
        continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
        continueId: v4(),
        interactId: v4(),
        interactRef: crypto.randomBytes(8).toString('hex').toUpperCase(),
        interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
      })
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN,
        value: crypto.randomBytes(8).toString('hex').toUpperCase(),
        managementId: v4()
      })
    })
    test('Can revoke un-expired token', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: 1000000 })
      const result = await accessTokenService.revoke(token.managementId)
      expect(result).toBeUndefined()
      await expect(
        AccessToken.query(trx).findById(token.id)
      ).resolves.toBeUndefined()
    })
    test('Can revoke even if token has already expired', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: -1 })
      const result = await accessTokenService.revoke(token.managementId)
      expect(result).toBeUndefined()
      await expect(
        AccessToken.query(trx).findById(token.id)
      ).resolves.toBeUndefined()
    })
    test('Can revoke even if token has already been revoked', async (): Promise<void> => {
      await token.$query(trx).delete()
      const result = await accessTokenService.revoke(token.id)
      expect(result).toBeUndefined()
      token = (await AccessToken.query(trx).findById(token.id)) as AccessToken
      expect(token).toBeUndefined()
    })
  })

  describe('Rotate', (): void => {
    let grant: Grant
    let token: AccessToken
    let originalTokenValue: string
    beforeEach(async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch({
        ...BASE_GRANT,
        continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
        continueId: v4(),
        interactId: v4(),
        interactRef: crypto.randomBytes(8).toString('hex').toUpperCase(),
        interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
      })
      await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN,
        value: crypto.randomBytes(8).toString('hex').toUpperCase(),
        managementId: v4()
      })
      originalTokenValue = token.value
    })

    test('Can rotate un-expired token', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: 1000000 })
      const result = await accessTokenService.rotate(token.managementId)
      expect(result.success).toBe(true)
      expect(result.success && result.value).not.toBe(originalTokenValue)
    })
    test('Can rotate expired token', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: -1 })
      const result = await accessTokenService.rotate(token.managementId)
      expect(result.success).toBe(true)
      token = (await AccessToken.query(trx).findOne({
        managementId: result.success && result.managementId
      })) as AccessToken
      expect(token.value).not.toBe(originalTokenValue)
    })
    test('Cannot rotate nonexistent token', async (): Promise<void> => {
      const result = await accessTokenService.rotate(v4())
      expect(result.success).toBe(false)
    })
  })
})
