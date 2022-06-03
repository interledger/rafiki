import { URL } from 'url'
import crypto from 'crypto'
import Knex, { Transaction } from 'knex'
import { v4 } from 'uuid'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config, IAppConfig } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { GrantService, GrantRequest } from '../grant/service'
import { Grant, StartMethod, FinishMethod } from '../grant/model'
import { Action, AccessType } from '../access/types'
import { Access } from '../access/model'

describe('Grant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grantService: GrantService
  let config: IAppConfig
  let knex: Knex
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      config = await deps.use('config')
      grantService = await deps.use('grantService')
      knex = await deps.use('knex')
      appContainer = await createTestApp(deps)
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
    }
  )

  const KEY_REGISTRY_URL = 'https://openpayments.network/keys/test-key'

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
    description: 'this is a test you fuck',
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

      const grantResponse = await grantService.initiateGrant(grantRequest)

      expect(grantResponse).toEqual(
        expect.objectContaining({
          interact: {
            redirect: expect.any(String),
            finish: expect.any(String)
          },
          continue: {
            access_token: {
              value: expect.any(String)
            },
            uri: expect.any(String),
            wait: config.waitTime
          }
        })
      )

      const redirectUrl = new URL(grantResponse.interact.redirect)
      const continueUrl = new URL(grantResponse.continue.uri)
      expect(redirectUrl.pathname).toMatch(/\/interact\/[a-z,A-Z,0-9,-]+/g)
      expect(continueUrl.pathname).toMatch(
        /\/auth\/continue\/[a-z,A-Z,0-9,-]+/g
      )

      const dbGrant = await Grant.query(trx)
        .where({
          interactNonce: grantResponse.interact.finish,
          continueToken: grantResponse.continue.access_token.value
        })
        .first()
      expect(dbGrant.interactId).toEqual(
        redirectUrl.pathname.replace('/interact/', '')
      )
      expect(dbGrant.continueId).toEqual(
        continueUrl.pathname.replace('/auth/continue/', '')
      )

      const dbAccessGrant = await Access.query(trx)
        .where({
          grantId: dbGrant.id
        })
        .first()

      expect(dbAccessGrant.type).toEqual(AccessType.IncomingPayment)
      expect(dbAccessGrant.limits).toEqual(INCOMING_PAYMENT_LIMIT)
    })
  })
})
