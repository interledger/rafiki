import assert from 'assert'
import crypto from 'crypto'
import { faker } from '@faker-js/faker'
import { Knex } from 'knex'
import { v4 } from 'uuid'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { GrantService, GrantRequest } from '../grant/service'
import { Grant, StartMethod, FinishMethod, GrantState } from '../grant/model'
import { Action, AccessType } from '../access/types'
import { Access } from '../access/model'
import { generateTestKeys } from 'http-signature-utils'

describe('Grant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grantService: GrantService
  let knex: Knex
  let trx: Knex.Transaction
  let testKeyId: string

  let grant: Grant

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    grantService = await deps.use('grantService')
    knex = await deps.use('knex')
    appContainer = await createTestApp(deps)

    testKeyId = (await generateTestKeys()).keyId
  })

  const CLIENT = faker.internet.url()

  beforeEach(async (): Promise<void> => {
    grant = await Grant.query().insert({
      state: GrantState.Pending,
      startMethod: [StartMethod.Redirect],
      continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
      continueId: v4(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com',
      clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
      client: CLIENT,
      clientKeyId: testKeyId,
      interactId: v4(),
      interactRef: v4(),
      interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
    })

    await Access.query().insert({
      ...BASE_GRANT_ACCESS,
      type: AccessType.IncomingPayment,
      grantId: grant.id
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  const BASE_GRANT_ACCESS = {
    actions: [Action.Create, Action.Read, Action.List],
    identifier: `https://example.com/${v4()}`
  }

  const BASE_GRANT_REQUEST = {
    client: CLIENT,
    interact: {
      start: [StartMethod.Redirect],
      finish: {
        method: FinishMethod.Redirect,
        uri: 'https://example.com/finish',
        nonce: crypto.randomBytes(8).toString('hex').toUpperCase()
      }
    }
  }

  describe('create', (): void => {
    test('Can initiate a grant', async (): Promise<void> => {
      const grantRequest: GrantRequest = {
        ...BASE_GRANT_REQUEST,
        clientKeyId: testKeyId,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.IncomingPayment
            }
          ]
        }
      }

      const grant = await grantService.create(grantRequest)

      expect(grant).toMatchObject({
        state: GrantState.Pending,
        continueId: expect.any(String),
        continueToken: expect.any(String),
        interactRef: expect.any(String),
        interactId: expect.any(String),
        interactNonce: expect.any(String),
        finishMethod: FinishMethod.Redirect,
        finishUri: BASE_GRANT_REQUEST.interact.finish.uri,
        clientNonce: BASE_GRANT_REQUEST.interact.finish.nonce,
        client: CLIENT,
        clientKeyId: testKeyId,
        startMethod: expect.arrayContaining([StartMethod.Redirect])
      })

      await expect(
        Access.query(trx)
          .where({
            grantId: grant.id
          })
          .first()
      ).resolves.toMatchObject({
        type: AccessType.IncomingPayment
      })
    })
    test('Can issue a grant without interaction', async (): Promise<void> => {
      const grantRequest: GrantRequest = {
        ...BASE_GRANT_REQUEST,
        clientKeyId: testKeyId,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.IncomingPayment
            }
          ]
        },
        interact: undefined
      }

      const grant = await grantService.create(grantRequest)

      expect(grant).toMatchObject({
        state: GrantState.Granted,
        continueId: expect.any(String),
        continueToken: expect.any(String),
        clientKeyId: testKeyId
      })

      await expect(
        Access.query(trx)
          .where({
            grantId: grant.id
          })
          .first()
      ).resolves.toMatchObject({
        type: AccessType.IncomingPayment
      })
    })
  })

  describe('issue', (): void => {
    test('Can issue a grant', async (): Promise<void> => {
      const issuedGrant = await grantService.issueGrant(grant.id)
      expect(issuedGrant.state).toEqual(GrantState.Granted)
    })
  })

  describe('continue', (): void => {
    test('Can fetch a grant by its continuation information', async (): Promise<void> => {
      const { continueId, continueToken, interactRef } = grant
      assert.ok(interactRef)

      const fetchedGrant = await grantService.getByContinue(
        continueId,
        continueToken,
        interactRef
      )
      expect(fetchedGrant?.id).toEqual(grant.id)
      expect(fetchedGrant?.continueId).toEqual(continueId)
      expect(fetchedGrant?.continueToken).toEqual(continueToken)
      expect(fetchedGrant?.interactRef).toEqual(interactRef)
    })
  })

  describe('get', (): void => {
    test('Can fetch a grant by id', async () => {
      const fetchedGrant = await grantService.get(grant.id)
      expect(fetchedGrant?.id).toEqual(grant.id)
    })
    test('Can fetch a grant by its interaction information', async (): Promise<void> => {
      assert.ok(grant.interactId)
      const fetchedGrant = await grantService.getByInteraction(grant.interactId)
      expect(fetchedGrant?.id).toEqual(grant.id)
      expect(fetchedGrant?.interactId).toEqual(grant.interactId)
    })
  })

  describe('reject', (): void => {
    test('Can reject a grant', async (): Promise<void> => {
      const rejectedGrant = await grantService.rejectGrant(grant.id)
      expect(rejectedGrant?.id).toEqual(grant.id)
      expect(rejectedGrant?.state).toEqual(GrantState.Rejected)
    })

    test("Cannot reject a grant that doesn't exist", async (): Promise<void> => {
      const rejectedGrant = await grantService.rejectGrant(v4())
      expect(rejectedGrant).toBeUndefined()
    })
  })
})
