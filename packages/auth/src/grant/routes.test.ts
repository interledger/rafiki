import { Knex } from 'knex'
import { v4 } from 'uuid'
import * as crypto from 'crypto'
import { IocContract } from '@adonisjs/fold'
import nock from 'nock'
import jestOpenAPI from 'jest-openapi'
import { URL } from 'url'

import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config, IAppConfig } from '../config/app'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { GrantRoutes, GrantChoices } from './routes'
import { Action, AccessType } from '../access/types'
import { Access } from '../access/model'
import { Grant, StartMethod, FinishMethod, GrantState } from '../grant/model'
import { AccessToken } from '../accessToken/model'
import { AccessTokenService } from '../accessToken/service'

import { KEY_REGISTRY_ORIGIN } from '../tests/signature'
export { KEY_REGISTRY_ORIGIN } from '../tests/signature'
export const KID_PATH = '/keys/base-test-key'
export const TEST_CLIENT_DISPLAY = {
  name: 'Test Client',
  uri: 'https://example.com'
}

// TODO: figure out why factoring this out causes tests to break, then factor out test client consts
export const TEST_CLIENT_KEY = {
  proof: 'httpsig',
  jwk: {
    client: {
      id: v4(),
      name: TEST_CLIENT_DISPLAY.name,
      email: 'bob@bob.com',
      image: 'a link to an image',
      uri: TEST_CLIENT_DISPLAY.uri
    },
    kid: KEY_REGISTRY_ORIGIN + KID_PATH,
    x: 'hin88zzQxp79OOqIFNCME26wMiz0yqjzgkcBe0MW8pE',
    kty: 'OKP',
    alg: 'EdDSA',
    crv: 'Ed25519',
    key_ops: ['sign', 'verify'],
    use: 'sig'
  }
}

const BASE_GRANT_ACCESS = {
  type: AccessType.IncomingPayment,
  actions: [Action.Create, Action.Read, Action.List],
  identifier: `https://example.com/${v4()}`
}

const BASE_GRANT_REQUEST = {
  access_token: {
    access: [
      {
        type: AccessType.OutgoingPayment,
        actions: [Action.Create, Action.Read, Action.List],
        identifier: `https://example.com/${v4()}`
      }
    ]
  },
  client: {
    display: TEST_CLIENT_DISPLAY,
    key: TEST_CLIENT_KEY
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

const generateBaseGrant = () => ({
  state: GrantState.Pending,
  startMethod: [StartMethod.Redirect],
  continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
  continueId: v4(),
  finishMethod: FinishMethod.Redirect,
  finishUri: 'https://example.com',
  clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
  clientKeyId: KEY_REGISTRY_ORIGIN + KID_PATH,
  interactId: v4(),
  interactRef: v4(),
  interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
})

describe('Grant Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let grantRoutes: GrantRoutes
  let config: IAppConfig
  let accessTokenService: AccessTokenService

  let grant: Grant
  beforeEach(async (): Promise<void> => {
    grant = await Grant.query().insert(generateBaseGrant())

    await Access.query().insert({
      ...BASE_GRANT_ACCESS,
      grantId: grant.id
    })
  })

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    grantRoutes = await deps.use('grantRoutes')
    config = await deps.use('config')
    knex = await deps.use('knex')
    appContainer = await createTestApp(deps)
    const openApi = await deps.use('openApi')
    jestOpenAPI(openApi.authServerSpec)
    accessTokenService = await deps.use('accessTokenService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('/create', (): void => {
    const url = '/'
    const method = 'POST'

    const expDate = new Date()
    expDate.setTime(expDate.getTime() + 1000 * 60 * 60)

    const nbfDate = new Date()
    nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)

    const exp = Math.round(expDate.getTime() / 1000)
    const nbf = Math.round(nbfDate.getTime() / 1000)

    test('accepts json only', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'text/plain',
            'Content-Type': 'application/json'
          },
          url,
          method
        },
        {}
      )

      ctx.request.body = BASE_GRANT_REQUEST

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(406)
      expect(ctx.body).toEqual({ error: 'invalid_request' })
    })

    test('sends json body only', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'text/plain'
          },
          url,
          method
        },
        {}
      )

      ctx.request.body = BASE_GRANT_REQUEST

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(406)
      expect(ctx.body).toEqual({ error: 'invalid_request' })
    })

    test('Can initiate a grant request', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_KEY.jwk,
          exp,
          nbf,
          revoked: false
        })

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url,
          method
        },
        {}
      )

      ctx.request.body = BASE_GRANT_REQUEST

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(200)
      expect(ctx.body).toEqual({
        interact: {
          redirect: expect.any(String),
          finish: expect.any(String)
        },
        continue: {
          access_token: {
            value: expect.any(String)
          },
          uri: expect.any(String),
          wait: Config.waitTimeSeconds
        }
      })

      scope.isDone()
    })

    test('Can get a software-only authorization grant', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_KEY.jwk,
          exp,
          nbf,
          revoked: false
        })

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url,
          method
        },
        {}
      )
      const body = {
        access_token: {
          access: [
            {
              type: AccessType.IncomingPayment,
              actions: [Action.Create, Action.Read, Action.List],
              identifier: `https://example.com/${v4()}`
            }
          ]
        },
        client: {
          display: TEST_CLIENT_DISPLAY,
          key: TEST_CLIENT_KEY
        }
      }
      ctx.request.body = body

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(200)
      expect(ctx.body).toEqual({
        access_token: {
          value: expect.any(String),
          manage: expect.any(String),
          access: body.access_token.access,
          expiresIn: 600
        },
        continue: {
          access_token: {
            value: expect.any(String)
          },
          uri: expect.any(String)
        }
      })

      scope.isDone()
    })
    test('Does not create grant if token issuance fails', async (): Promise<void> => {
      jest
        .spyOn(accessTokenService, 'create')
        .mockRejectedValueOnce(new Error())
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_KEY.jwk,
          exp,
          nbf,
          revoked: false
        })

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url,
          method
        },
        {}
      )
      const body = {
        access_token: {
          access: [
            {
              type: AccessType.IncomingPayment,
              actions: [Action.Create, Action.Read, Action.List],
              identifier: `https://example.com/${v4()}`
            }
          ]
        },
        client: {
          display: TEST_CLIENT_DISPLAY,
          key: TEST_CLIENT_KEY
        }
      }
      ctx.request.body = body

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(500)
      scope.isDone()
    })
    test('Fails to initiate a grant w/o interact field', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_KEY.jwk,
          exp,
          nbf,
          revoked: false
        })

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url,
          method
        },
        {}
      )

      ctx.request.body = { ...BASE_GRANT_REQUEST, interact: undefined }

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(400)

      scope.isDone()
    })
  })

  // TODO: validate that routes satisfy API spec
  describe('interaction', (): void => {
    beforeEach(async (): Promise<void> => {
      const openApi = await deps.use('openApi')
      jestOpenAPI(openApi.idpSpec)
    })
    describe('interaction start', (): void => {
      test('Interaction start fails if grant is invalid', async (): Promise<void> => {
        const scope = nock(KEY_REGISTRY_ORIGIN)
          .get(KID_PATH)
          .reply(200, {
            ...TEST_CLIENT_KEY.jwk,
            revoked: false
          })

        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          },
          { id: 'unknown_interaction', nonce: grant.interactNonce }
        )

        await expect(
          grantRoutes.interaction.start(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.status).toBe(401)
        expect(ctx.body).toEqual({ error: 'unknown_request' })
        scope.isDone()
      })

      test('Interaction start fails if client is invalid', async (): Promise<void> => {
        const grantWithInvalidClient = await Grant.query().insert({
          state: GrantState.Pending,
          startMethod: [StartMethod.Redirect],
          continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
          continueId: v4(),
          finishMethod: FinishMethod.Redirect,
          finishUri: 'https://example.com',
          clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
          clientKeyId: KEY_REGISTRY_ORIGIN + '/wrong-key',
          interactId: v4(),
          interactRef: v4(),
          interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
        })

        await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: grantWithInvalidClient.id
        })
        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          },
          {
            id: grantWithInvalidClient.interactId,
            nonce: grantWithInvalidClient.interactNonce
          }
        )

        await expect(
          grantRoutes.interaction.start(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.status).toBe(401)
        expect(ctx.body).toEqual({ error: 'invalid_client' })
      })

      test('Can start an interaction', async (): Promise<void> => {
        const scope = nock(KEY_REGISTRY_ORIGIN)
          .get(KID_PATH)
          .reply(200, {
            ...TEST_CLIENT_KEY.jwk,
            revoked: false
          })

        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          },
          { id: grant.interactId, nonce: grant.interactNonce }
        )

        const redirectUrl = new URL(config.identityServerDomain)
        redirectUrl.searchParams.set('interactId', grant.interactId)
        const redirectSpy = jest.spyOn(ctx, 'redirect')

        await expect(
          grantRoutes.interaction.start(ctx)
        ).resolves.toBeUndefined()

        redirectUrl.searchParams.set('nonce', grant.interactNonce as string)

        expect(ctx.status).toBe(302)
        expect(redirectSpy).toHaveBeenCalledWith(redirectUrl.toString())
        expect(ctx.session.nonce).toEqual(grant.interactNonce)

        scope.isDone()
      })
    })

    describe('interaction complete', (): void => {
      test('cannot finish interaction with missing id', async (): Promise<void> => {
        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: {
              nonce: grant.interactNonce
            }
          },
          { id: '', nonce: grant.interactNonce }
        )

        await expect(
          grantRoutes.interaction.finish(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.status).toBe(404)
        expect(ctx.body).toEqual({
          error: 'unknown_request'
        })
      })

      test('Cannot finish interaction with invalid session', async (): Promise<void> => {
        const invalidNonce = crypto.randomBytes(8).toString('hex')
        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: { nonce: invalidNonce }
          },
          { nonce: grant.interactNonce, id: grant.interactId }
        )

        await expect(
          grantRoutes.interaction.finish(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.status).toBe(401)
        expect(ctx.body).toEqual({
          error: 'invalid_request'
        })
      })

      test('Cannot finish interaction that does not exist', async (): Promise<void> => {
        const fakeInteractId = v4()
        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: { nonce: grant.interactNonce }
          },
          { id: fakeInteractId, nonce: grant.interactNonce }
        )

        await expect(
          grantRoutes.interaction.finish(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.status).toBe(404)
        expect(ctx.body).toEqual({
          error: 'unknown_request'
        })
      })

      test('Can finish accepted interaction', async (): Promise<void> => {
        const grant = await Grant.query().insert({
          ...generateBaseGrant(),
          state: GrantState.Granted
        })

        await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: grant.id
        })

        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: {
              nonce: grant.interactNonce
            }
          },
          { id: grant.interactId, nonce: grant.interactNonce }
        )

        const clientRedirectUri = new URL(grant.finishUri)
        const { clientNonce, interactNonce, interactRef } = grant
        const interactUrl =
          config.identityServerDomain + `/interact/${grant.interactId}`

        const data = `${clientNonce}\n${interactNonce}\n${interactRef}\n${interactUrl}`
        const hash = crypto.createHash('sha3-512').update(data).digest('base64')
        clientRedirectUri.searchParams.set('hash', hash)
        clientRedirectUri.searchParams.set('interact_ref', interactRef)

        const redirectSpy = jest.spyOn(ctx, 'redirect')

        await expect(
          grantRoutes.interaction.finish(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.status).toBe(302)
        expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())
      })

      test('Can finish rejected interaction', async (): Promise<void> => {
        const grant = await Grant.query().insert({
          ...generateBaseGrant(),
          state: GrantState.Rejected
        })

        await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: grant.id
        })

        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: {
              nonce: grant.interactNonce
            }
          },
          { id: grant.interactId, nonce: grant.interactNonce }
        )

        const clientRedirectUri = new URL(grant.finishUri)
        clientRedirectUri.searchParams.set('result', 'grant_rejected')

        const redirectSpy = jest.spyOn(ctx, 'redirect')

        await expect(
          grantRoutes.interaction.finish(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.status).toBe(302)
        expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())
      })

      test('Cannot finish invalid interaction', async (): Promise<void> => {
        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: {
              nonce: grant.interactNonce
            }
          },
          { id: grant.interactId, nonce: grant.interactNonce }
        )

        const clientRedirectUri = new URL(grant.finishUri)
        clientRedirectUri.searchParams.set('result', 'grant_invalid')

        const redirectSpy = jest.spyOn(ctx, 'redirect')

        await expect(
          grantRoutes.interaction.finish(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.status).toBe(302)
        expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())
      })
    })
  })

  describe('accept/reject grant', (): void => {
    test('cannot accept/reject grant without secret', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        },
        {
          id: grant.interactId,
          nonce: grant.interactNonce,
          choice: GrantChoices.Accept
        }
      )

      await expect(
        grantRoutes.interaction.acceptOrReject(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(ctx.body).toEqual({
        error: 'invalid_interaction'
      })
    })

    test('can accept grant', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-idp-secret': Config.identityServerSecret
          }
        },
        {
          id: grant.interactId,
          nonce: grant.interactNonce,
          choice: GrantChoices.Accept
        }
      )

      await expect(
        grantRoutes.interaction.acceptOrReject(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.status).toBe(202)

      const issuedGrant = await Grant.query().findById(grant.id)
      expect(issuedGrant.state).toEqual(GrantState.Granted)
    })

    test('Cannot accept or reject grant if grant does not exist', async (): Promise<void> => {
      const interactId = v4()
      const nonce = crypto.randomBytes(8).toString('hex').toUpperCase()
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-idp-secret': Config.identityServerSecret
          }
        },
        { id: interactId, nonce }
      )

      await expect(
        grantRoutes.interaction.acceptOrReject(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.status).toBe(404)
    })

    test('Can reject grant', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-idp-secret': Config.identityServerSecret
          }
        },
        {
          id: grant.interactId,
          nonce: grant.interactNonce,
          choice: GrantChoices.Reject
        }
      )

      await expect(
        grantRoutes.interaction.acceptOrReject(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.status).toBe(202)

      const issuedGrant = await Grant.query().findById(grant.id)
      expect(issuedGrant.state).toEqual(GrantState.Rejected)
    })

    test('Cannot make invalid grant choice', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-idp-secret': Config.identityServerSecret
          }
        },
        {
          id: grant.interactId,
          nonce: grant.interactNonce,
          choice: 'invalidChoice'
        }
      )

      await expect(
        grantRoutes.interaction.acceptOrReject(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.status).toBe(404)

      const issuedGrant = await Grant.query().findById(grant.id)
      expect(issuedGrant.state).toEqual(GrantState.Pending)
    })
  })

  describe('Grant details', (): void => {
    let grant: Grant
    let access: Access

    beforeAll(async (): Promise<void> => {
      grant = await Grant.query().insert({
        ...generateBaseGrant()
      })

      access = await Access.query().insertAndFetch({
        ...BASE_GRANT_ACCESS,
        grantId: grant.id
      })
    })

    test('Can get grant details', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-idp-secret': Config.identityServerSecret
          },
          url: `/grant/${grant.interactId}/${grant.interactNonce}`,
          method: 'GET'
        },
        { id: grant.interactId, nonce: grant.interactNonce }
      )

      const formattedAccess = access
      delete formattedAccess.id
      delete formattedAccess.createdAt
      delete formattedAccess.updatedAt
      await expect(
        grantRoutes.interaction.details(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.status).toBe(200)
      expect(ctx.body).toEqual({ access: [formattedAccess] })
      expect(ctx.response).toSatisfyApiSpec()
    })

    test('Cannot get grant details for nonexistent grant', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-idp-secret': Config.identityServerSecret
          },
          url: `/grant/${grant.interactId}/${grant.interactNonce}`,
          method: 'GET'
        },
        { id: v4(), nonce: grant.interactNonce }
      )
      await expect(
        grantRoutes.interaction.details(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.status).toBe(404)
      expect(ctx.response).toSatisfyApiSpec()
    })

    test('Cannot get grant details without secret', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: `/grant/${grant.interactId}/${grant.interactNonce}`,
          method: 'GET'
        },
        { id: grant.interactId, nonce: grant.interactNonce }
      )

      await expect(
        grantRoutes.interaction.details(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      // TODO: add this response to spec
      // expect(ctx.response).toSatisfyApiSpec()
    })
  })

  describe('/continue', (): void => {
    beforeEach(async (): Promise<void> => {
      const openApi = await deps.use('openApi')
      jestOpenAPI(openApi.authServerSpec)
    })
    test('Can issue access token', async (): Promise<void> => {
      const grant = await Grant.query().insert({
        ...generateBaseGrant(),
        state: GrantState.Granted
      })

      const access = await Access.query().insert({
        ...BASE_GRANT_ACCESS,
        grantId: grant.id
      })

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          },
          url: `/continue/${grant.continueId}`,
          method: 'POST'
        },
        {
          id: grant.continueId
        }
      )

      ctx.request.body = {
        interact_ref: grant.interactRef
      }

      await expect(grantRoutes.continue(ctx)).resolves.toBeUndefined()

      expect(ctx.response).toSatisfyApiSpec()

      const accessToken = await AccessToken.query().findOne({
        grantId: grant.id
      })

      expect(ctx.status).toBe(200)
      expect(ctx.body).toEqual({
        access_token: {
          value: accessToken.value,
          manage:
            Config.authServerDomain + `/token/${accessToken.managementId}`,
          access: expect.arrayContaining([
            {
              actions: expect.arrayContaining(['create', 'read', 'list']),
              identifier: access.identifier,
              type: 'incoming-payment'
            }
          ]),
          expiresIn: 600
        },
        continue: {
          access_token: {
            value: expect.any(String)
          },
          uri: expect.any(String)
        }
      })
    })

    test('Cannot issue access token if grant does not exist', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `GNAP ${v4()}`
          }
        },
        {
          id: v4()
        }
      )

      ctx.request.body = {
        interact_ref: v4()
      }

      await expect(grantRoutes.continue(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(404)
      expect(ctx.body).toEqual({
        error: 'unknown_request'
      })
    })

    test('Cannot issue access token if grant has not been granted', async (): Promise<void> => {
      await Access.query().insert({
        ...BASE_GRANT_ACCESS,
        grantId: grant.id
      })

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          }
        },
        {
          id: grant.continueId
        }
      )

      ctx.request.body = {
        interact_ref: grant.interactRef
      }

      await expect(grantRoutes.continue(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(ctx.body).toEqual({
        error: 'request_denied'
      })
    })

    test('Cannot issue access token without interact ref', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          }
        },
        {
          id: grant.continueId
        }
      )

      ctx.request.body = {}

      await expect(grantRoutes.continue(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(ctx.body).toEqual({
        error: 'invalid_request'
      })
    })

    test('Cannot issue access token without continue token', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        },
        {
          id: grant.continueId
        }
      )

      ctx.request.body = {
        interact_ref: grant.interactRef
      }

      await expect(grantRoutes.continue(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(ctx.body).toEqual({
        error: 'invalid_request'
      })
    })

    test('Cannot issue access token without continue id', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          }
        },
        {}
      )

      ctx.request.body = {
        interact_ref: grant.interactRef
      }

      await expect(grantRoutes.continue(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(ctx.body).toEqual({
        error: 'invalid_request'
      })
    })
  })
})
