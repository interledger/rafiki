import { faker } from '@faker-js/faker'
import { Knex } from 'knex'
import { v4 } from 'uuid'
import * as crypto from 'crypto'
import { IocContract } from '@adonisjs/fold'
import nock from 'nock'
import jestOpenAPI from 'jest-openapi'
import { URL } from 'url'

import { createContext as createAppContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config, IAppConfig } from '../config/app'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { GrantRoutes, GrantChoices } from './routes'
import { Access } from '../access/model'
import { Grant, StartMethod, FinishMethod, GrantState } from '../grant/model'
import { AccessToken } from '../accessToken/model'
import { AccessTokenService } from '../accessToken/service'
import { generateNonce, generateToken } from '../shared/utils'
import { AccessType, AccessAction } from 'open-payments'

export const TEST_CLIENT_DISPLAY = {
  name: 'Test Client',
  uri: 'https://example.com'
}

const CLIENT = faker.internet.url()
const CLIENT_KEY_ID = v4()

const BASE_GRANT_ACCESS = {
  type: AccessType.IncomingPayment,
  actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
  identifier: `https://example.com/${v4()}`
}

const BASE_GRANT_REQUEST = {
  access_token: {
    access: [
      {
        type: AccessType.OutgoingPayment,
        actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
        identifier: `https://example.com/${v4()}`
      }
    ]
  },
  client: CLIENT,
  interact: {
    start: [StartMethod.Redirect],
    finish: {
      method: FinishMethod.Redirect,
      uri: 'https://example.com/finish',
      nonce: generateNonce()
    }
  }
}

describe('Grant Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let grantRoutes: GrantRoutes
  let config: IAppConfig
  let accessTokenService: AccessTokenService

  let grant: Grant

  const generateBaseGrant = () => ({
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    continueToken: generateToken(),
    continueId: v4(),
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com',
    clientNonce: generateNonce(),
    client: CLIENT,
    clientKeyId: CLIENT_KEY_ID,
    interactId: v4(),
    interactRef: v4(),
    interactNonce: generateNonce()
  })

  const createContext = (
    reqOpts: httpMocks.RequestOptions,
    params: Record<string, unknown>
  ) => {
    const ctx = createAppContext(reqOpts, params)
    ctx.clientKeyId = CLIENT_KEY_ID
    return ctx
  }

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

    test('Can initiate a grant request', async (): Promise<void> => {
      const scope = nock(CLIENT).get('/').reply(200, {
        id: CLIENT,
        publicName: TEST_CLIENT_DISPLAY.name,
        assetCode: 'USD',
        assetScale: 2,
        authServer: Config.authServerDomain
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

      scope.done()
    })

    test('Can get a software-only authorization grant', async (): Promise<void> => {
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
              actions: [
                AccessAction.Create,
                AccessAction.Read,
                AccessAction.List
              ],
              identifier: `https://example.com/${v4()}`
            }
          ]
        },
        client: CLIENT
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
          expires_in: 600
        },
        continue: {
          access_token: {
            value: expect.any(String)
          },
          uri: expect.any(String)
        }
      })
    })
    test('Does not create grant if token issuance fails', async (): Promise<void> => {
      jest
        .spyOn(accessTokenService, 'create')
        .mockRejectedValueOnce(new Error())

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
              actions: [
                AccessAction.Create,
                AccessAction.Read,
                AccessAction.List
              ],
              identifier: `https://example.com/${v4()}`
            }
          ]
        },
        client: CLIENT
      }
      ctx.request.body = body

      await expect(grantRoutes.create(ctx)).rejects.toHaveProperty(
        'status',
        500
      )
    })
    test('Fails to initiate a grant w/o interact field', async (): Promise<void> => {
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

      await expect(grantRoutes.create(ctx)).rejects.toMatchObject({
        status: 400,
        error: 'interaction_required'
      })
    })
  })

  // TODO: validate that routes satisfy API spec
  // https://github.com/interledger/rafiki/issues/841
  describe('interaction', (): void => {
    beforeEach(async (): Promise<void> => {
      const openApi = await deps.use('openApi')
      jestOpenAPI(openApi.idpSpec)
    })
    describe('interaction start', (): void => {
      test('Interaction start fails if grant is invalid', async (): Promise<void> => {
        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          },
          { id: 'unknown_interaction', nonce: grant.interactNonce }
        )

        await expect(grantRoutes.interaction.start(ctx)).rejects.toMatchObject({
          status: 401,
          error: 'unknown_request'
        })
      })

      test('Can start an interaction', async (): Promise<void> => {
        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            query: {
              clientName: 'Test Client',
              clientUri: 'https://example.com'
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
        redirectUrl.searchParams.set('clientName', 'Test Client')
        redirectUrl.searchParams.set('clientUri', 'https://example.com')

        expect(ctx.status).toBe(302)
        expect(redirectSpy).toHaveBeenCalledWith(redirectUrl.toString())
        expect(ctx.session.nonce).toEqual(grant.interactNonce)
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

        await expect(grantRoutes.interaction.finish(ctx)).rejects.toMatchObject(
          {
            status: 404,
            error: 'unknown_request'
          }
        )
      })

      test('Cannot finish interaction with invalid session', async (): Promise<void> => {
        const invalidNonce = generateNonce()
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

        await expect(grantRoutes.interaction.finish(ctx)).rejects.toMatchObject(
          {
            status: 401,
            error: 'invalid_request'
          }
        )
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

        await expect(grantRoutes.interaction.finish(ctx)).rejects.toMatchObject(
          {
            status: 404,
            error: 'unknown_request'
          }
        )
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
      ).rejects.toMatchObject({
        status: 401,
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
      const nonce = generateNonce()
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
      ).rejects.toMatchObject({
        status: 404,
        error: 'unknown_request'
      })
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
      ).rejects.toMatchObject({
        status: 404
      })

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
      await expect(grantRoutes.interaction.details(ctx)).rejects.toMatchObject({
        status: 404
      })
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

      await expect(grantRoutes.interaction.details(ctx)).rejects.toMatchObject({
        status: 401
      })
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
          expires_in: 600
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

      await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
        status: 404,
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

      await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
        status: 401,
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

      await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
        status: 401,
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

      await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
        status: 401,
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

      await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
        status: 401,
        error: 'invalid_request'
      })
    })

    test('Can cancel a grant request / pending grant', async (): Promise<void> => {
      const ctx = createContext(
        {
          url: '/continue/{id}',
          method: 'delete',
          headers: {
            Authorization: `GNAP ${grant.continueToken}`
          }
        },
        {
          id: grant.continueId
        }
      )
      await expect(grantRoutes.delete(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(204)
    })

    test('Can delete an existing grant', async (): Promise<void> => {
      const grant = await Grant.query().insert({
        ...generateBaseGrant(),
        state: GrantState.Granted
      })
      const ctx = createContext(
        {
          url: '/continue/{id}',
          method: 'delete',
          headers: {
            Authorization: `GNAP ${grant.continueToken}`
          }
        },
        {
          id: grant.continueId
        }
      )
      await expect(grantRoutes.delete(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(204)
    })

    test('Cannot delete non-existing grant', async (): Promise<void> => {
      const ctx = createContext(
        {
          url: '/continue/{id}',
          method: 'delete',
          headers: {
            Authorization: `GNAP ${grant.continueToken}`
          }
        },
        {
          id: v4()
        }
      )
      await expect(grantRoutes.delete(ctx)).rejects.toMatchObject({
        status: 404,
        error: 'unknown_request'
      })
    })

    test.each`
      token    | description    | status | error
      ${true}  | ${' matching'} | ${404} | ${'unknown_request'}
      ${false} | ${''}          | ${401} | ${'invalid_request'}
    `(
      'Cannot delete without$description continueToken',
      async ({ token, status, error }): Promise<void> => {
        const ctx = createContext(
          {
            url: '/continue/{id}',
            method: 'delete',
            headers: token
              ? {
                  Authorization: `GNAP ${v4()}`
                }
              : undefined
          },
          {
            id: v4()
          }
        )
        await expect(grantRoutes.delete(ctx)).rejects.toMatchObject({
          status,
          error
        })
      }
    )
  })
})
