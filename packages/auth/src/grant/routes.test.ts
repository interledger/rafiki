import { faker } from '@faker-js/faker'
import { v4 } from 'uuid'
import * as crypto from 'crypto'
import { IocContract } from '@adonisjs/fold'
import nock from 'nock'
import jestOpenAPI from 'jest-openapi'
import { URL } from 'url'
import assert from 'assert'

import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config, IAppConfig } from '../config/app'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import {
  GrantRoutes,
  GrantChoices,
  CreateContext,
  ContinueContext,
  DeleteContext,
  StartContext,
  FinishContext,
  GetContext,
  ChooseContext
} from './routes'
import { Access } from '../access/model'
import { Grant, StartMethod, FinishMethod, GrantState } from '../grant/model'
import { AccessToken } from '../accessToken/model'
import { AccessTokenService } from '../accessToken/service'
import { generateNonce, generateToken } from '../shared/utils'
import { ClientService } from '../client/service'
import { withConfigOverride } from '../tests/helpers'
import { AccessAction, AccessType } from '@interledger/open-payments'

export const TEST_CLIENT_DISPLAY = {
  name: 'Test Client',
  uri: 'https://example.com'
}

const CLIENT = faker.internet.url()

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
  let grantRoutes: GrantRoutes
  let config: IAppConfig
  let accessTokenService: AccessTokenService
  let clientService: ClientService

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
    interactId: v4(),
    interactRef: v4(),
    interactNonce: generateNonce()
  })

  beforeEach(async (): Promise<void> => {
    grant = await Grant.query().insert(generateBaseGrant())

    await Access.query().insert({
      ...BASE_GRANT_ACCESS,
      grantId: grant.id
    })
  })

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)

    appContainer = await createTestApp(deps)

    grantRoutes = await deps.use('grantRoutes')
    config = await deps.use('config')
    accessTokenService = await deps.use('accessTokenService')
    clientService = await deps.use('clientService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Client - Auth Server Routes', (): void => {
    beforeAll(async (): Promise<void> => {
      const openApi = await deps.use('openApi')
      jestOpenAPI(openApi.authServerSpec)
    })

    describe('/create', (): void => {
      const url = '/'
      const method = 'POST'

      describe('non-interactive grants', () => {
        describe.each`
          interactionFlagsEnabled | description
          ${true}                 | ${'enabled'}
          ${false}                | ${'disabled'}
        `(
          'with interaction flags $description',
          ({ interactionFlagsEnabled }) => {
            test.each`
              accessTypes                                       | description
              ${[AccessType.IncomingPayment]}                   | ${'grant for incoming payments'}
              ${[AccessType.Quote]}                             | ${'grant for quotes'}
              ${[AccessType.IncomingPayment, AccessType.Quote]} | ${'grant for incoming payments and quotes'}
            `(
              `can${interactionFlagsEnabled ? 'not' : ''} get $description`,
              withConfigOverride(
                () => config,
                {
                  incomingPaymentInteraction: interactionFlagsEnabled,
                  quoteInteraction: interactionFlagsEnabled
                },
                async ({ accessTypes }): Promise<void> => {
                  const ctx = createContext<CreateContext>(
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
                      access: accessTypes.map((accessType) => ({
                        type: accessType,
                        actions: [AccessAction.Create, AccessAction.Read],
                        identifier: `https://example.com/${v4()}`
                      }))
                    },
                    client: CLIENT
                  }
                  ctx.request.body = body

                  if (interactionFlagsEnabled) {
                    await expect(grantRoutes.create(ctx)).rejects.toMatchObject(
                      {
                        status: 400,
                        error: 'interaction_required'
                      }
                    )
                  } else {
                    await expect(
                      grantRoutes.create(ctx)
                    ).resolves.toBeUndefined()
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
                  }
                }
              )
            )
          }
        )
      })

      test('Can initiate a grant request', async (): Promise<void> => {
        const scope = nock(CLIENT).get('/').reply(200, {
          id: CLIENT,
          publicName: TEST_CLIENT_DISPLAY.name,
          assetCode: 'USD',
          assetScale: 2,
          authServer: Config.authServerDomain
        })

        const ctx = createContext<CreateContext>(
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

      test('Does not create grant if token issuance fails', async (): Promise<void> => {
        jest
          .spyOn(accessTokenService, 'create')
          .mockRejectedValueOnce(new Error())

        const ctx = createContext<CreateContext>(
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
        const ctx = createContext<CreateContext>(
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

      test('Fails to initiate a grant if payment pointer has no public name', async (): Promise<void> => {
        jest.spyOn(clientService, 'get').mockResolvedValueOnce(undefined)

        const ctx = createContext<CreateContext>(
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

        await expect(grantRoutes.create(ctx)).rejects.toMatchObject({
          status: 400,
          error: 'invalid_client'
        })
      })
    })

    describe('/continue', (): void => {
      test('Can issue access token', async (): Promise<void> => {
        const grant = await Grant.query().insert({
          ...generateBaseGrant(),
          state: GrantState.Granted
        })

        const access = await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: grant.id
        })

        const ctx = createContext<ContinueContext>(
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

        assert.ok(grant.interactRef)

        ctx.request.body = {
          interact_ref: grant.interactRef
        }

        await expect(grantRoutes.continue(ctx)).resolves.toBeUndefined()

        expect(ctx.response).toSatisfyApiSpec()

        const accessToken = await AccessToken.query().findOne({
          grantId: grant.id
        })

        assert.ok(accessToken)

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
        const ctx = createContext<ContinueContext>(
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

        const ctx = createContext<ContinueContext>(
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

        assert.ok(grant.interactRef)

        ctx.request.body = {
          interact_ref: grant.interactRef
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          error: 'request_denied'
        })
      })

      test('Cannot issue access token without interact ref', async (): Promise<void> => {
        const ctx = createContext<ContinueContext>(
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

        ctx.request.body = {} as {
          interact_ref: string
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          error: 'invalid_request'
        })
      })

      test('Cannot issue access token without continue token', async (): Promise<void> => {
        const ctx = createContext<ContinueContext>(
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

        assert.ok(grant.interactRef)

        ctx.request.body = {
          interact_ref: grant.interactRef
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          error: 'invalid_request'
        })
      })

      test('Cannot issue access token without continue id', async (): Promise<void> => {
        const ctx = createContext<ContinueContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `GNAP ${grant.continueToken}`
            }
          },
          {}
        )

        assert.ok(grant.interactRef)

        ctx.request.body = {
          interact_ref: grant.interactRef
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          error: 'invalid_request'
        })
      })

      test('Can cancel a grant request / pending grant', async (): Promise<void> => {
        const ctx = createContext<DeleteContext>(
          {
            url: '/continue/{id}',
            method: 'DELETE',
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
        const ctx = createContext<DeleteContext>(
          {
            url: '/continue/{id}',
            method: 'DELETE',
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
        const ctx = createContext<DeleteContext>(
          {
            url: '/continue/{id}',
            method: 'DELETE',
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
          const ctx = createContext<DeleteContext>(
            {
              url: '/continue/{id}',
              method: 'DELETE',
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

  describe('Interaction', (): void => {
    beforeAll(async (): Promise<void> => {
      const openApi = await deps.use('openApi')
      jestOpenAPI(openApi.idpSpec)
    })

    describe('Client - interaction start', (): void => {
      test('Interaction start fails if grant is invalid', async (): Promise<void> => {
        const ctx = createContext<StartContext>(
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
        const ctx = createContext<StartContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            query: {
              clientName: 'Test Client',
              clientUri: 'https://example.com'
            },
            url: `/interact/${grant.interactId}/${grant.interactNonce}`
          },
          { id: grant.interactId, nonce: grant.interactNonce }
        )

        assert.ok(grant.interactId)

        const redirectUrl = new URL(config.identityServerDomain)
        redirectUrl.searchParams.set('interactId', grant.interactId)
        const redirectSpy = jest.spyOn(ctx, 'redirect')

        await expect(
          grantRoutes.interaction.start(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()

        redirectUrl.searchParams.set('nonce', grant.interactNonce as string)
        redirectUrl.searchParams.set('clientName', 'Test Client')
        redirectUrl.searchParams.set('clientUri', 'https://example.com')

        expect(ctx.status).toBe(302)
        expect(redirectSpy).toHaveBeenCalledWith(redirectUrl.toString())
        expect(ctx.session.nonce).toEqual(grant.interactNonce)
      })
    })

    describe('Client - interaction complete', (): void => {
      test('cannot finish interaction with missing id', async (): Promise<void> => {
        const ctx = createContext<FinishContext>(
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
        const ctx = createContext<FinishContext>(
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
        const ctx = createContext<FinishContext>(
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

        const ctx = createContext<FinishContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: {
              nonce: grant.interactNonce
            },
            url: `/interact/${grant.interactId}/${grant.interactNonce}/finish`
          },
          { id: grant.interactId, nonce: grant.interactNonce }
        )

        assert.ok(grant.finishUri)
        const clientRedirectUri = new URL(grant.finishUri)
        const { clientNonce, interactNonce, interactRef } = grant

        const interactUrl =
          config.identityServerDomain + `/interact/${grant.interactId}`

        const data = `${clientNonce}\n${interactNonce}\n${interactRef}\n${interactUrl}`
        const hash = crypto.createHash('sha3-512').update(data).digest('base64')
        clientRedirectUri.searchParams.set('hash', hash)
        assert.ok(interactRef)
        clientRedirectUri.searchParams.set('interact_ref', interactRef)

        const redirectSpy = jest.spyOn(ctx, 'redirect')

        await expect(
          grantRoutes.interaction.finish(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
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

        const ctx = createContext<FinishContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: {
              nonce: grant.interactNonce
            },
            url: `/interact/${grant.interactId}/${grant.interactNonce}/finish`
          },
          { id: grant.interactId, nonce: grant.interactNonce }
        )

        assert.ok(grant.finishUri)
        const clientRedirectUri = new URL(grant.finishUri)
        clientRedirectUri.searchParams.set('result', 'grant_rejected')

        const redirectSpy = jest.spyOn(ctx, 'redirect')

        await expect(
          grantRoutes.interaction.finish(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(302)
        expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())
      })

      test('Cannot finish invalid interaction', async (): Promise<void> => {
        const ctx = createContext<FinishContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: {
              nonce: grant.interactNonce
            },
            url: `/interact/${grant.interactId}/${grant.interactNonce}/finish`
          },
          { id: grant.interactId, nonce: grant.interactNonce }
        )

        assert.ok(grant.finishUri)
        const clientRedirectUri = new URL(grant.finishUri)
        clientRedirectUri.searchParams.set('result', 'grant_invalid')

        const redirectSpy = jest.spyOn(ctx, 'redirect')

        await expect(
          grantRoutes.interaction.finish(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(302)
        expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())
      })
    })

    describe('IDP - Grant details', (): void => {
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
        const ctx = createContext<GetContext>(
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

        await expect(
          grantRoutes.interaction.details(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.status).toBe(200)
        expect(ctx.body).toEqual({
          access: [
            {
              actions: access.actions,
              identifier: access.identifier,
              type: access.type
            }
          ]
        })
      })

      test('Cannot get grant details for nonexistent grant', async (): Promise<void> => {
        const ctx = createContext<GetContext>(
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
        ).rejects.toMatchObject({
          status: 404
        })
      })

      test('Cannot get grant details without secret', async (): Promise<void> => {
        const ctx = createContext<GetContext>(
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
        ).rejects.toMatchObject({
          status: 401
        })
      })

      test('Cannot get grant details for nonexistent grant', async (): Promise<void> => {
        const ctx = createContext<GetContext>(
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
        ).rejects.toMatchObject({
          status: 404
        })
      })

      test('Cannot get grant details without secret', async (): Promise<void> => {
        const ctx = createContext<GetContext>(
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
        ).rejects.toMatchObject({
          status: 401
        })
      })
    })
    describe('IDP - accept/reject grant', (): void => {
      test('cannot accept/reject grant without secret', async (): Promise<void> => {
        const ctx = createContext<ChooseContext>(
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
        const ctx = createContext<ChooseContext>(
          {
            url: `/grant/${grant.id}/${grant.interactNonce}/accept`,
            method: 'POST',
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
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(202)

        const issuedGrant = await Grant.query().findById(grant.id)
        assert.ok(issuedGrant)
        expect(issuedGrant.state).toEqual(GrantState.Granted)
      })

      test('Cannot accept or reject grant if grant does not exist', async (): Promise<void> => {
        const interactId = v4()
        const nonce = generateNonce()
        const ctx = createContext<ChooseContext>(
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
        const ctx = createContext<ChooseContext>(
          {
            url: `/grant/${grant.id}/${grant.interactNonce}/reject`,
            method: 'POST',
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
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(202)

        const issuedGrant = await Grant.query().findById(grant.id)
        assert.ok(issuedGrant)
        expect(issuedGrant.state).toEqual(GrantState.Rejected)
      })

      test('Cannot make invalid grant choice', async (): Promise<void> => {
        const ctx = createContext<ChooseContext>(
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
        assert.ok(issuedGrant)
        expect(issuedGrant.state).toEqual(GrantState.Pending)
      })
    })
  })
})
