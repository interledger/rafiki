import { faker } from '@faker-js/faker'
import { v4 } from 'uuid'
import { IocContract } from '@adonisjs/fold'
import nock from 'nock'
import jestOpenAPI from 'jest-openapi'
import assert from 'assert'

import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config, IAppConfig } from '../config/app'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import {
  GrantRoutes,
  CreateContext,
  ContinueContext,
  RevokeContext
} from './routes'
import { Access } from '../access/model'
import {
  Grant,
  StartMethod,
  FinishMethod,
  GrantState,
  GrantFinalization
} from '../grant/model'
import { Interaction, InteractionState } from '../interaction/model'
import { AccessToken } from '../accessToken/model'
import { AccessTokenService } from '../accessToken/service'
import { generateNonce } from '../shared/utils'
import { ClientService } from '../client/service'
import { withConfigOverride } from '../tests/helpers'
import { AccessAction, AccessType } from '@interledger/open-payments'
import { generateBaseGrant } from '../tests/grant'
import { generateBaseInteraction } from '../tests/interaction'

export const TEST_CLIENT_DISPLAY = {
  name: 'Test Client',
  uri: 'https://example.com'
}

const CLIENT = faker.internet.url({ appendSlash: false })

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
                      access: accessTypes.map((accessType: AccessType) => ({
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

      test('Fails to initiate a grant if wallet address has no public name', async (): Promise<void> => {
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
      let grant: Grant
      let interaction: Interaction
      let access: Access
      beforeEach(async (): Promise<void> => {
        grant = await Grant.query().insert(
          generateBaseGrant({
            state: GrantState.Approved
          })
        )

        access = await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: grant.id
        })

        interaction = await Interaction.query().insert(
          generateBaseInteraction(grant, {
            state: InteractionState.Approved
          })
        )
      })

      test('Can issue access token', async (): Promise<void> => {
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

        ctx.request.body = {
          interact_ref: interaction.ref
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
        const grant = await Grant.query().insert(
          generateBaseGrant({
            state: GrantState.Pending
          })
        )
        await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: grant.id
        })

        const interaction = await Interaction.query().insert(
          generateBaseInteraction(grant)
        )

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

        ctx.request.body = {
          interact_ref: interaction.ref
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          error: 'request_denied'
        })
      })

      test('Cannot issue access token if grant has been revoked', async (): Promise<void> => {
        const grant = await Grant.query().insert(
          generateBaseGrant({
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Revoked
          })
        )
        await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: grant.id
        })

        const interaction = await Interaction.query().insert(
          generateBaseInteraction(grant)
        )

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

        ctx.request.body = {
          interact_ref: interaction.ref
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 404,
          error: 'unknown_request'
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

        ctx.request.body = {
          interact_ref: interaction.ref
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

        ctx.request.body = {
          interact_ref: interaction.ref
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          error: 'invalid_request'
        })
      })

      test('Can cancel a grant request / pending grant', async (): Promise<void> => {
        const ctx = createContext<RevokeContext>(
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
        await expect(grantRoutes.revoke(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(204)
      })

      test('Can revoke an existing grant', async (): Promise<void> => {
        const grant = await Grant.query().insert(
          generateBaseGrant({
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Issued
          })
        )
        const ctx = createContext<RevokeContext>(
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
        await expect(grantRoutes.revoke(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(204)
      })

      test('Cannot revoke an already revoked grant', async (): Promise<void> => {
        const grant = await Grant.query().insert(
          generateBaseGrant({
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Revoked
          })
        )
        const ctx = createContext<RevokeContext>(
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
        await expect(grantRoutes.revoke(ctx)).rejects.toMatchObject({
          status: 404,
          error: 'unknown_request'
        })
      })

      test('Cannot revoke non-existing grant', async (): Promise<void> => {
        const ctx = createContext<RevokeContext>(
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
        await expect(grantRoutes.revoke(ctx)).rejects.toMatchObject({
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
          const ctx = createContext<RevokeContext>(
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
          await expect(grantRoutes.revoke(ctx)).rejects.toMatchObject({
            status,
            error
          })
        }
      )
    })
  })
})
