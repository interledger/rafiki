import crypto from 'crypto'
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

describe('Grant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grantService: GrantService
  let knex: Knex
  let trx: Knex.Transaction

  let grant: Grant

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    grantService = await deps.use('grantService')
    knex = await deps.use('knex')
    appContainer = await createTestApp(deps)
  })

  const KEY_REGISTRY_URL = 'https://openpayments.network/keys/test-key'

  beforeEach(async (): Promise<void> => {
    grant = await Grant.query().insert({
      state: GrantState.Pending,
      startMethod: [StartMethod.Redirect],
      continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
      continueId: v4(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com',
      clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
      clientKeyId: KEY_REGISTRY_URL,
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
    locations: ['https://example.com'],
    identifier: 'test-identifier'
  }

  const BASE_GRANT_REQUEST = {
    client: {
      display: {
        name: 'Test Client',
        uri: 'https://example.com'
      },
      key: {
        proof: 'httpsig',
        jwk: {
          client: {
            id: v4(),
            name: 'Bob',
            email: 'bob@bob.com',
            image: 'a link to an image',
            uri: 'https://bob.com'
          },
          kid: KEY_REGISTRY_URL,
          x: 'test-public-key',
          kty: 'OKP',
          alg: 'EdDSA',
          crv: 'Ed25519',
          key_ops: ['sign', 'verify'],
          use: 'sig'
        }
      }
    },
    interact: {
      start: [StartMethod.Redirect],
      finish: {
        method: FinishMethod.Redirect,
        uri: 'https://example.com/finish',
        nonce: crypto.randomBytes(8).toString('hex').toUpperCase()
      }
    }
  }

  const INCOMING_PAYMENT_LIMIT = {
    incomingAmount: {
      value: '1000000000',
      assetCode: 'usd',
      assetScale: 9
    },
    expiresAt: new Date().toISOString(),
    description: 'this is a test',
    externalRef: v4()
  }

  describe('create', (): void => {
    test('Can create a grant', async (): Promise<void> => {
      const grantRequest: GrantRequest = {
        ...BASE_GRANT_REQUEST,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.IncomingPayment,
              limits: INCOMING_PAYMENT_LIMIT
            }
          ]
        }
      }

      const grant = await grantService.initiateGrant(grantRequest)

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
        clientKeyId: BASE_GRANT_REQUEST.client.key.jwk.kid,
        startMethod: expect.arrayContaining([StartMethod.Redirect])
      })

      const dbAccessGrant = await Access.query(trx)
        .where({
          grantId: grant.id
        })
        .first()

      expect(dbAccessGrant.type).toEqual(AccessType.IncomingPayment)
      expect(dbAccessGrant.limits).toEqual(INCOMING_PAYMENT_LIMIT)
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
