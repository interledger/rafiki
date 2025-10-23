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
import { InteractionService } from '../interaction/service'
import { AccessToken } from '../accessToken/model'
import { AccessTokenService } from '../accessToken/service'
import { generateNonce } from '../shared/utils'
import { ClientService } from '../client/service'
import { withConfigOverride } from '../tests/helpers'
import {
  AccessAction,
  AccessType,
  GrantContinuation,
  PendingGrant
} from '@interledger/open-payments'
import { generateBaseGrant } from '../tests/grant'
import { generateBaseInteraction } from '../tests/interaction'
import { GNAPErrorCode } from '../shared/gnapErrors'
import { Tenant } from '../tenant/model'
import { generateTenant } from '../tests/tenant'
import { AccessError } from '../access/errors'

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

function getGrantContinueId(continueUrl: string): string {
  const continueUrlObj = new URL(continueUrl)
  const pathItems = continueUrlObj.pathname.split('/')
  return pathItems[pathItems.length - 1]
}

function getInteractionId(redirectUrl: string): string {
  const redirectUrlObj = new URL(redirectUrl)
  const pathItems = redirectUrlObj.pathname.split('/')
  return pathItems[pathItems.length - 2]
}

describe('Grant Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grantRoutes: GrantRoutes
  let config: IAppConfig
  let accessTokenService: AccessTokenService
  let clientService: ClientService
  let interactionService: InteractionService

  let tenant: Tenant
  let grant: Grant

  beforeEach(async (): Promise<void> => {
    tenant = await Tenant.query().insertAndFetch(generateTenant())
    grant = await Grant.query().insert(
      generateBaseGrant({ tenantId: tenant.id })
    )

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
    interactionService = await deps.use('interactionService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
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
          accessTypes                                       | description
          ${[AccessType.IncomingPayment]}                   | ${'grant for incoming payments'}
          ${[AccessType.Quote]}                             | ${'grant for quotes'}
          ${[AccessType.IncomingPayment, AccessType.Quote]} | ${'grant for incoming payments and quotes'}
        `('for $description', ({ accessTypes }) => {
          describe.each`
            resourceInteractionFlagsEnabled | listAllInteractionFlagEnabled | listAllGrant | description
            ${true}                         | ${false}                      | ${false}     | ${'no list-all grant'}
            ${false}                        | ${false}                      | ${false}     | ${'no list-all grant'}
            ${true}                         | ${false}                      | ${true}      | ${'including a list-all grant'}
            ${false}                        | ${false}                      | ${true}      | ${'including a list-all grant'}
            ${true}                         | ${true}                       | ${true}      | ${'including a list-all grant'}
            ${false}                        | ${true}                       | ${true}      | ${'including a list-all grant'}
          `(
            'with resource interaction flags set to $resourceInteractionFlagsEnabled, list all grant interaction flag set to $listAllInteractionFlagEnabled, and $description',
            ({
              resourceInteractionFlagsEnabled,
              listAllInteractionFlagEnabled,
              listAllGrant
            }) => {
              // Quotes don't have list-all access type
              if (
                !(
                  accessTypes.length === 1 &&
                  accessTypes[0] === AccessType.Quote &&
                  listAllGrant
                )
              ) {
                test(
                  `can${
                    resourceInteractionFlagsEnabled || listAllGrant ? 'not' : ''
                  } get grant`,
                  withConfigOverride(
                    () => config,
                    {
                      incomingPaymentInteraction:
                        resourceInteractionFlagsEnabled,
                      quoteInteraction: resourceInteractionFlagsEnabled,
                      listAllInteraction: listAllInteractionFlagEnabled
                    },
                    async (): Promise<void> => {
                      const ctx = createContext<CreateContext>(
                        {
                          headers: {
                            Accept: 'application/json',
                            'Content-Type': 'application/json'
                          },
                          url,
                          method
                        },
                        {
                          tenantId: tenant.id
                        }
                      )
                      const body = {
                        access_token: {
                          access: accessTypes.map((accessType: AccessType) => ({
                            type: accessType,
                            actions:
                              listAllGrant && accessType !== AccessType.Quote
                                ? [AccessAction.Create, AccessAction.ListAll]
                                : [AccessAction.Create, AccessAction.Read],
                            identifier: `https://example.com/${v4()}`
                          }))
                        },
                        client: CLIENT
                      }
                      ctx.request.body = body

                      if (
                        resourceInteractionFlagsEnabled ||
                        (listAllInteractionFlagEnabled && listAllGrant)
                      ) {
                        await expect(
                          grantRoutes.create(ctx)
                        ).rejects.toMatchObject({
                          status: 400,
                          code: GNAPErrorCode.InvalidRequest,
                          message: "missing required request field 'interact'"
                        })
                      } else {
                        await expect(
                          grantRoutes.create(ctx)
                        ).resolves.toBeUndefined()
                        expect(ctx.response).toSatisfyApiSpec()
                        expect(ctx.status).toBe(200)
                        const createdGrant = await Grant.query().findOne({
                          continueId: getGrantContinueId(
                            (ctx.body as GrantContinuation).continue.uri
                          ),
                          continueToken: (ctx.body as GrantContinuation)
                            .continue.access_token.value
                        })
                        assert.ok(createdGrant)
                        expect(ctx.body).toEqual({
                          access_token: {
                            value: expect.any(String),
                            manage: expect.any(String),
                            access: body.access_token.access,
                            expires_in: 600
                          },
                          continue: {
                            access_token: {
                              value: createdGrant.continueToken
                            },
                            uri: `${config.authServerUrl}/continue/${createdGrant.continueId}`
                          }
                        })
                      }
                    }
                  )
                )
              }
            }
          )
        })
      })

      test('Can initiate a grant request', async (): Promise<void> => {
        const scope = nock(CLIENT)
          .get('/')
          .reply(200, {
            id: CLIENT,
            publicName: TEST_CLIENT_DISPLAY.name,
            assetCode: 'USD',
            assetScale: 2,
            authServer: Config.authServerUrl,
            resourceServer: faker.internet.url({ appendSlash: false })
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
          {
            tenantId: tenant.id
          }
        )

        ctx.request.body = BASE_GRANT_REQUEST

        await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(200)
        const createdGrant = await Grant.query().findOne({
          continueId: getGrantContinueId(
            (ctx.body as PendingGrant).continue.uri
          ),
          continueToken: (ctx.body as PendingGrant).continue.access_token.value
        })
        assert.ok(createdGrant)
        const createdInteraction = await Interaction.query().findOne({
          nonce: (ctx.body as PendingGrant).interact.finish,
          id: getInteractionId((ctx.body as PendingGrant).interact.redirect)
        })
        assert.ok(createdInteraction)
        const expectedRedirectUrl = new URL(
          config.authServerUrl +
            `/interact/${createdInteraction.id}/${createdInteraction.nonce}`
        )
        expectedRedirectUrl.searchParams.set(
          'clientName',
          TEST_CLIENT_DISPLAY.name
        )
        expectedRedirectUrl.searchParams.set('clientUri', CLIENT)
        expect(ctx.body).toEqual({
          interact: {
            redirect: expectedRedirectUrl.toString(),
            finish: createdInteraction.nonce
          },
          continue: {
            access_token: {
              value: createdGrant.continueToken
            },
            uri: `${config.authServerUrl}/continue/${createdGrant.continueId}`,
            wait: Config.waitTimeSeconds
          }
        })

        scope.done()
      })

      test('Does not create interactive grant if tenant has no idp', async (): Promise<void> => {
        const unconfiguredTenant = await Tenant.query().insertAndFetch({
          apiSecret: crypto.randomUUID(),
          idpConsentUrl: undefined,
          idpSecret: undefined
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
          {
            tenantId: unconfiguredTenant.id
          }
        )

        ctx.request.body = BASE_GRANT_REQUEST

        await expect(grantRoutes.create(ctx)).rejects.toMatchObject({
          status: 400,
          code: GNAPErrorCode.InvalidRequest,
          message: 'invalid tenant'
        })
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
          {
            tenantId: tenant.id
          }
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

        await expect(grantRoutes.create(ctx)).rejects.toMatchObject({
          status: 500,
          code: GNAPErrorCode.RequestDenied,
          message: 'internal server error'
        })
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
          {
            tenantId: tenant.id
          }
        )

        ctx.request.body = { ...BASE_GRANT_REQUEST, interact: undefined }

        await expect(grantRoutes.create(ctx)).rejects.toMatchObject({
          status: 400,
          code: GNAPErrorCode.InvalidRequest,
          message: "missing required request field 'interact'"
        })
      })

      test('Does not create interactive grant if interaction creation fails', async (): Promise<void> => {
        jest
          .spyOn(interactionService, 'create')
          .mockRejectedValueOnce(new Error())

        nock(CLIENT)
          .get('/')
          .reply(200, {
            id: CLIENT,
            publicName: TEST_CLIENT_DISPLAY.name,
            assetCode: 'USD',
            assetScale: 2,
            authServer: Config.authServerUrl,
            resourceServer: faker.internet.url({ appendSlash: false })
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
          {
            tenantId: tenant.id
          }
        )

        ctx.request.body = BASE_GRANT_REQUEST

        await expect(grantRoutes.create(ctx)).rejects.toMatchObject({
          status: 500,
          code: GNAPErrorCode.RequestDenied,
          message: 'internal server error'
        })
      })

      test('Fails to initiate a grant w/o identifier field if interaction required', async (): Promise<void> => {
        const ctx = createContext<CreateContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            url,
            method
          },
          {
            tenantId: tenant.id
          }
        )

        const grantRequest = {
          access_token: {
            access: [
              {
                type: AccessType.IncomingPayment,
                actions: [AccessAction.Create, AccessAction.ListAll]
              }
            ]
          },
          client: CLIENT,
          interact: BASE_GRANT_REQUEST.interact
        }

        ctx.request.body = grantRequest

        await expect(grantRoutes.create(ctx)).rejects.toMatchObject({
          status: 400,
          code: GNAPErrorCode.InvalidRequest,
          message: 'access identifier required'
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
          {
            tenantId: tenant.id
          }
        )

        ctx.request.body = BASE_GRANT_REQUEST

        await expect(grantRoutes.create(ctx)).rejects.toMatchObject({
          status: 400,
          code: GNAPErrorCode.InvalidClient,
          message: "missing required request field 'client'"
        })
      })

      test('Fails to create a grant with at least one access having both receiveAmount and debitAmount as limits', async (): Promise<void> => {
        const scope = nock(CLIENT)
          .get('/')
          .reply(200, {
            id: CLIENT,
            publicName: TEST_CLIENT_DISPLAY.name,
            assetCode: 'USD',
            assetScale: 2,
            authServer: Config.authServerUrl,
            resourceServer: faker.internet.url({ appendSlash: false })
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
          {
            tenantId: tenant.id
          }
        )
        ctx.request.body = {
          ...BASE_GRANT_REQUEST,
          access_token: {
            access: [
              {
                type: 'outgoing-payment',
                actions: [
                  AccessAction.Create,
                  AccessAction.Read,
                  AccessAction.List
                ],
                identifier: `https://example.com/${v4()}`,
                limits: {
                  receiver: '',
                  debitAmount: {
                    value: '1000',
                    assetCode: 'USD',
                    assetScale: 1
                  },
                  receiveAmount: {
                    value: '1000',
                    assetCode: 'USD',
                    assetScale: 1
                  }
                }
              }
            ]
          }
        }
        await expect(grantRoutes.create(ctx)).rejects.toMatchObject({
          status: 400,
          code: GNAPErrorCode.InvalidRequest,
          message: AccessError.OnlyOneAccessAmountAllowed
        })
        scope.done()
      })

      test('Fails to initiate a grant without providing a tenant id', async (): Promise<void> => {
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
          status: 404,
          code: GNAPErrorCode.InvalidRequest,
          message: 'Not Found'
        })
      })

      test('Fails to initiate a grant if the provided tenant does not exist', async (): Promise<void> => {
        const ctx = createContext<CreateContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            url,
            method
          },
          {
            tenantId: v4()
          }
        )

        ctx.request.body = BASE_GRANT_REQUEST

        await expect(grantRoutes.create(ctx)).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.InvalidRequest,
          message: 'Not Found'
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
            tenantId: tenant.id,
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

        const now = new Date(
          grant.createdAt.getTime() + (config.waitTimeSeconds + 1) * 1000
        )
        jest.useFakeTimers({ now })
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
            id: grant.continueId,
            tenantId: tenant.id
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
        const createdGrant = await Grant.query().findOne({
          continueId: getGrantContinueId(
            (ctx.body as GrantContinuation).continue.uri
          ),
          continueToken: (ctx.body as GrantContinuation).continue.access_token
            .value
        })
        assert.ok(createdGrant)
        expect(ctx.body).toEqual({
          access_token: {
            value: accessToken.value,
            manage: Config.authServerUrl + `/token/${accessToken.managementId}`,
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
              value: createdGrant.continueToken
            },
            uri: `${config.authServerUrl}/continue/${createdGrant.continueId}`
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
            id: v4(),
            tenantId: tenant.id
          }
        )

        ctx.request.body = {
          interact_ref: v4()
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.InvalidContinuation,
          message: 'grant not found'
        })
      })

      test('Cannot issue access token if grant has not been granted', async (): Promise<void> => {
        const grant = await Grant.query().insert(
          generateBaseGrant({
            tenantId: tenant.id,
            state: GrantState.Pending
          })
        )
        await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: grant.id
        })

        const now = new Date(
          grant.createdAt.getTime() + (config.waitTimeSeconds + 1) * 1000
        )
        jest.useFakeTimers({ now })

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
            id: grant.continueId,
            tenantId: tenant.id
          }
        )

        ctx.request.body = {
          interact_ref: interaction.ref
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.RequestDenied,
          message: 'grant interaction not approved'
        })
      })

      test('Cannot issue access token if grant has been revoked', async (): Promise<void> => {
        const grant = await Grant.query().insert(
          generateBaseGrant({
            tenantId: tenant.id,
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
            id: grant.continueId,
            tenantId: tenant.id
          }
        )

        ctx.request.body = {
          interact_ref: interaction.ref
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.InvalidContinuation,
          message: 'grant not found'
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
            id: grant.continueId,
            tenantId: tenant.id
          }
        )

        ctx.request.body = {
          interact_ref: interaction.ref
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.InvalidContinuation,
          message: 'missing continuation information'
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
          {
            tenantId: tenant.id
          }
        )

        ctx.request.body = {
          interact_ref: interaction.ref
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.InvalidContinuation,
          message: 'missing continuation information'
        })
      })

      test('Cannot issue access token if body provided without interaction reference', async (): Promise<void> => {
        const ctx = createContext<ContinueContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `GNAP ${grant.continueToken}`
            }
          },
          {
            id: grant.continueId,
            tenantId: tenant.id
          }
        )

        ctx.request.body = {
          interact_ref: undefined
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.InvalidRequest,
          message: 'missing interaction reference'
        })
      })

      test('Honors wait value when continuing too early', async (): Promise<void> => {
        const grantWithWait = await Grant.query().insert(
          generateBaseGrant({ tenantId: tenant.id })
        )

        await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: grantWithWait.id
        })

        const interactionWithWait = await Interaction.query().insert(
          generateBaseInteraction(grantWithWait, {
            state: InteractionState.Pending
          })
        )

        const ctx = createContext<ContinueContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `GNAP ${grantWithWait.continueToken}`
            }
          },
          {
            id: grantWithWait.continueId,
            tenantId: tenant.id
          }
        )

        ctx.request.body = {
          interact_ref: interactionWithWait.ref
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 400,
          code: GNAPErrorCode.TooFast,
          message: 'continued grant faster than "wait" period'
        })
      })

      test.each`
        state                    | description
        ${GrantState.Processing} | ${'processing'}
        ${GrantState.Pending}    | ${'pending'}
        ${GrantState.Approved}   | ${'approved'}
      `(
        'Polls correctly for continuation on a $description grant',
        async ({ state }): Promise<void> => {
          const polledGrant = await Grant.query().insert(
            generateBaseGrant({
              tenantId: tenant.id,
              state,
              noFinishMethod: true
            })
          )

          const polledGrantAccess = await Access.query().insert({
            ...BASE_GRANT_ACCESS,
            grantId: polledGrant.id
          })

          await Interaction.query().insert(
            generateBaseInteraction(grant, {
              state: InteractionState.Approved
            })
          )

          const now = new Date(
            polledGrant.createdAt.getTime() +
              (config.waitTimeSeconds + 1) * 1000
          )
          jest.useFakeTimers({ now })

          const ctx = createContext<ContinueContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `GNAP ${polledGrant.continueToken}`
              },
              url: `/continue/${polledGrant.continueId}`,
              method: 'POST'
            },
            {
              id: polledGrant.continueId,
              tenantId: tenant.id
            }
          )

          ctx.request.body = {}

          await expect(grantRoutes.continue(ctx)).resolves.toBeUndefined()

          expect(ctx.response).toSatisfyApiSpec()
          expect(ctx.status).toBe(200)

          const expectedBody = {
            continue: {
              access_token: {
                value: expect.any(String)
              },
              uri: expect.any(String)
            }
          }

          if (state === GrantState.Processing || state === GrantState.Pending) {
            Object.assign(expectedBody.continue, {
              wait: config.waitTimeSeconds
            })
            const updatedPolledGrant = await Grant.query().findById(
              polledGrant.id
            )
            expect(
              updatedPolledGrant?.lastContinuedAt.getTime()
            ).toBeGreaterThan(polledGrant.lastContinuedAt.getTime())
          }

          if (state === GrantState.Approved) {
            const accessToken = await AccessToken.query().findOne({
              grantId: polledGrant.id
            })

            assert.ok(accessToken)

            Object.assign(expectedBody, {
              access_token: {
                value: accessToken.value,
                manage:
                  Config.authServerUrl + `/token/${accessToken.managementId}`,
                access: expect.arrayContaining([
                  {
                    actions: expect.arrayContaining(['create', 'read', 'list']),
                    identifier: polledGrantAccess.identifier,
                    type: 'incoming-payment'
                  }
                ]),
                expires_in: 600
              }
            })
          }

          expect(ctx.body).toEqual(expectedBody)
        }
      )

      test('Cannot poll a finalized grant', async (): Promise<void> => {
        const finalizedPolledGrant = await Grant.query().insert(
          generateBaseGrant({
            tenantId: tenant.id,
            state: GrantState.Finalized,
            noFinishMethod: true
          })
        )

        const now = new Date(
          finalizedPolledGrant.createdAt.getTime() +
            (config.waitTimeSeconds + 1) * 1000
        )
        jest.useFakeTimers({ now })
        const ctx = createContext<ContinueContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `GNAP ${finalizedPolledGrant.continueToken}`
            },
            url: `/continue/${finalizedPolledGrant.continueId}`,
            method: 'POST'
          },
          {
            id: finalizedPolledGrant.continueId
          }
        )

        ctx.request.body = {}
        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.RequestDenied,
          message: 'grant cannot be continued'
        })
      })

      test('Cannot poll a grant with a finish method', async (): Promise<void> => {
        const ctx = createContext<ContinueContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `GNAP ${grant.continueToken}`
            }
          },
          {
            id: grant.continueId,
            tenantId: tenant.id
          }
        )

        ctx.request.body = {} as {
          interact_ref: string
        }

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.RequestDenied,
          message: 'grant cannot be polled'
        })
      })

      test('Cannot poll a grant faster than its wait method', async (): Promise<void> => {
        const polledGrant = await Grant.query().insert(
          generateBaseGrant({
            tenantId: tenant.id,
            noFinishMethod: true
          })
        )

        await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: polledGrant.id
        })

        await Interaction.query().insert(
          generateBaseInteraction(grant, {
            state: InteractionState.Approved
          })
        )

        const ctx = createContext<ContinueContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `GNAP ${polledGrant.continueToken}`
            },
            url: `/continue/${polledGrant.continueId}`,
            method: 'POST'
          },
          {
            id: polledGrant.continueId,
            tenantId: tenant.id
          }
        )

        ctx.request.body = {}

        await expect(grantRoutes.continue(ctx)).rejects.toMatchObject({
          status: 400,
          code: GNAPErrorCode.TooFast,
          message: 'polled grant faster than "wait" period'
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
            id: grant.continueId,
            tenantId: tenant.id
          }
        )
        await expect(grantRoutes.revoke(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(204)
      })

      test('Can revoke an existing grant', async (): Promise<void> => {
        const grant = await Grant.query().insert(
          generateBaseGrant({
            tenantId: tenant.id,
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
            id: grant.continueId,
            tenantId: tenant.id
          }
        )
        await expect(grantRoutes.revoke(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(204)
      })

      test('Cannot revoke an already revoked grant', async (): Promise<void> => {
        const grant = await Grant.query().insert(
          generateBaseGrant({
            tenantId: tenant.id,
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
            id: grant.continueId,
            tenantId: tenant.id
          }
        )
        await expect(grantRoutes.revoke(ctx)).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.InvalidRequest,
          message: 'unknown grant'
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
            id: v4(),
            tenantId: tenant.id
          }
        )
        await expect(grantRoutes.revoke(ctx)).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.InvalidRequest,
          message: 'unknown grant'
        })
      })

      test.each`
        token    | description    | error
        ${true}  | ${' matching'} | ${{ status: 404, code: GNAPErrorCode.InvalidRequest, message: 'unknown grant' }}
        ${false} | ${''}          | ${{ status: 401, code: GNAPErrorCode.InvalidRequest, message: 'invalid continuation information' }}
      `(
        'Cannot delete without$description continueToken',
        async ({ token, error }): Promise<void> => {
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
              id: v4(),
              tenantId: tenant.id
            }
          )
          await expect(grantRoutes.revoke(ctx)).rejects.toMatchObject(error)
        }
      )
    })
  })
})
