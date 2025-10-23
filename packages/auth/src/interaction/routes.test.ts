import { v4 } from 'uuid'
import crypto from 'crypto'
import jestOpenAPI from 'jest-openapi'
import { IocContract } from '@adonisjs/fold'
import assert from 'assert'
import { AccessAction, AccessType } from '@interledger/open-payments'

import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config, IAppConfig } from '../config/app'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import {
  InteractionRoutes,
  InteractionChoices,
  StartContext,
  FinishContext,
  GetContext,
  ChooseContext
} from './routes'
import { Interaction, InteractionState } from './model'
import { Grant, GrantState, GrantFinalization } from '../grant/model'
import { Access } from '../access/model'
import { generateNonce } from '../shared/utils'
import { GNAPErrorCode } from '../shared/gnapErrors'
import { generateBaseGrant } from '../tests/grant'
import { generateBaseInteraction } from '../tests/interaction'
import { Tenant } from '../tenant/model'
import { generateTenant } from '../tests/tenant'

const BASE_GRANT_ACCESS = {
  type: AccessType.IncomingPayment,
  actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
  identifier: `https://example.com/${v4()}`
}

describe('Interaction Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let interactionRoutes: InteractionRoutes
  let config: IAppConfig

  let tenant: Tenant
  let grant: Grant
  let interaction: Interaction

  beforeEach(async (): Promise<void> => {
    tenant = await Tenant.query().insert(generateTenant())
    grant = await Grant.query().insert(
      generateBaseGrant({ tenantId: tenant.id })
    )

    await Access.query().insert({
      ...BASE_GRANT_ACCESS,
      grantId: grant.id
    })

    interaction = await Interaction.query().insert(
      generateBaseInteraction(grant)
    )
  })

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)

    appContainer = await createTestApp(deps)

    interactionRoutes = await deps.use('interactionRoutes')
    config = await deps.use('config')
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    jest.useRealTimers()
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Interaction', (): void => {
    beforeAll(async (): Promise<void> => {
      const openApi = await deps.use('openApi')
      jestOpenAPI(openApi.idpSpec)
    })

    describe('Client - interaction start', (): void => {
      test.each`
        isFinishableGrant | description
        ${true}           | ${'finishable'}
        ${false}          | ${'unfinishable'}
      `(
        'Interaction start fails if tenant for $description grant has no configured idp',
        async ({ isFinishableGrant }): Promise<void> => {
          const unconfiguredTenant = await Tenant.query().insertAndFetch({
            apiSecret: v4(),
            idpConsentUrl: undefined,
            idpSecret: undefined
          })
          const grant = await Grant.query().insert(
            generateBaseGrant({
              tenantId: unconfiguredTenant.id,
              noFinishMethod: !isFinishableGrant
            })
          )
          const interaction = await Interaction.query().insert(
            generateBaseInteraction(grant)
          )

          const ctx = createContext<StartContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              }
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          if (isFinishableGrant) {
            const redirectSpy = jest.spyOn(ctx, 'redirect')
            await expect(interactionRoutes.start(ctx)).resolves.toBeUndefined()
            expect(ctx.status).toBe(302)

            assert.ok(grant.finishUri)
            const redirectUrl = new URL(grant.finishUri)
            redirectUrl.searchParams.set('result', GNAPErrorCode.RequestDenied)
            redirectUrl.searchParams.set('message', 'internal server error')
            expect(redirectSpy).toHaveBeenCalledWith(redirectUrl.toString())
          } else {
            await expect(interactionRoutes.start(ctx)).rejects.toMatchObject({
              status: 500,
              code: GNAPErrorCode.RequestDenied,
              message: 'internal server error'
            })
          }
        }
      )
      test('Interaction start fails if interaction is invalid', async (): Promise<void> => {
        const ctx = createContext<StartContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          },
          { id: v4(), nonce: interaction.nonce }
        )

        await expect(interactionRoutes.start(ctx)).rejects.toMatchObject({
          status: 400,
          code: GNAPErrorCode.UnknownInteraction,
          message: 'unknown interaction'
        })
      })

      test.each`
        isFinishableGrant | description
        ${true}           | ${'finishable'}
        ${false}          | ${'unfinishable'}
      `(
        'Interaction start fails if $description grant is revoked',
        async ({ isFinishableGrant }): Promise<void> => {
          const grant = await Grant.query().insert(
            generateBaseGrant({
              tenantId: tenant.id,
              noFinishMethod: !isFinishableGrant,
              state: GrantState.Finalized,
              finalizationReason: GrantFinalization.Revoked
            })
          )

          const interaction = await Interaction.query().insert(
            generateBaseInteraction(grant)
          )

          const ctx = createContext<StartContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              url: `/interact/${interaction.id}/${interaction.nonce}`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          if (isFinishableGrant) {
            const redirectSpy = jest.spyOn(ctx, 'redirect')
            await expect(interactionRoutes.start(ctx)).resolves.toBeUndefined()
            expect(ctx.status).toBe(302)
            expect(ctx.response).toSatisfyApiSpec()

            assert.ok(grant.finishUri)
            const redirectUrl = new URL(grant.finishUri)
            redirectUrl.searchParams.set(
              'result',
              GNAPErrorCode.InvalidInteraction
            )
            redirectUrl.searchParams.set('message', 'invalid interaction')
            expect(redirectSpy).toHaveBeenCalledWith(redirectUrl.toString())
          } else {
            await expect(interactionRoutes.start(ctx)).rejects.toMatchObject({
              status: 403,
              code: GNAPErrorCode.InvalidInteraction,
              message: 'invalid interaction'
            })
          }
        }
      )

      test.each`
        isFinishableGrant | description
        ${true}           | ${'finishable'}
        ${false}          | ${'unfinishable'}
      `(
        'handles unexpected error for $description grant',
        async ({ isFinishableGrant }): Promise<void> => {
          const grant = await Grant.query().insertAndFetch(
            generateBaseGrant({
              tenantId: tenant.id,
              noFinishMethod: !isFinishableGrant
            })
          )

          const interaction = await Interaction.query()
            .insertAndFetch(generateBaseInteraction(grant))
            .withGraphFetched('grant')

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
              url: `/interact/${interaction.id}/${interaction.nonce}`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          const grantService = await deps.use('grantService')
          const markPendingSpy = jest
            .spyOn(grantService, 'markPending')
            .mockRejectedValueOnce(new Error('unexpected'))

          if (isFinishableGrant) {
            const redirectSpy = jest.spyOn(ctx, 'redirect')
            await expect(interactionRoutes.start(ctx)).resolves.toBeUndefined()
            expect(ctx.status).toBe(302)
            expect(ctx.response).toSatisfyApiSpec()

            assert.ok(interaction.grant?.finishUri)
            const redirectUrl = new URL(interaction.grant.finishUri)
            redirectUrl.searchParams.set('result', GNAPErrorCode.RequestDenied)
            redirectUrl.searchParams.set('message', 'internal server error')
            expect(redirectSpy).toHaveBeenCalledWith(redirectUrl.toString())
          } else {
            await expect(interactionRoutes.start(ctx)).rejects.toMatchObject({
              status: 500,
              code: GNAPErrorCode.RequestDenied,
              message: 'internal server error'
            })
          }

          expect(markPendingSpy).toHaveBeenCalled()
        }
      )

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
            url: `/interact/${interaction.id}/${interaction.nonce}`
          },
          { id: interaction.id, nonce: interaction.nonce, tenantId: tenant.id }
        )

        assert.ok(interaction.id)
        assert.ok(tenant.idpConsentUrl)
        const redirectUrl = new URL(tenant.idpConsentUrl)
        redirectUrl.searchParams.set('interactId', interaction.id)
        const redirectSpy = jest.spyOn(ctx, 'redirect')

        await expect(interactionRoutes.start(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()

        redirectUrl.searchParams.set('nonce', interaction.nonce)
        redirectUrl.searchParams.set('clientName', 'Test Client')
        redirectUrl.searchParams.set('clientUri', 'https://example.com')

        expect(ctx.status).toBe(302)
        expect(redirectSpy).toHaveBeenCalledWith(redirectUrl.toString())
        expect(ctx.session.nonce).toEqual(interaction.nonce)
      })
    })

    describe('Client - interaction complete', (): void => {
      let interaction: Interaction

      beforeEach(async (): Promise<void> => {
        interaction = await Interaction.query().insert(
          generateBaseInteraction(grant, {
            state: InteractionState.Approved
          })
        )
      })

      test('cannot finish interaction with missing id', async (): Promise<void> => {
        const ctx = createContext<FinishContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: {
              nonce: interaction.nonce
            }
          },
          { id: null, nonce: interaction.nonce }
        )

        await expect(interactionRoutes.finish(ctx)).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.UnknownInteraction,
          message: 'unknown interaction'
        })
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
          { nonce: interaction.nonce, id: interaction.id }
        )

        await expect(interactionRoutes.finish(ctx)).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.InvalidRequest,
          message: 'invalid session'
        })
      })

      test('Cannot finish interaction that does not exist', async (): Promise<void> => {
        const fakeInteractId = v4()
        const ctx = createContext<FinishContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: { nonce: interaction.nonce }
          },
          { id: fakeInteractId, nonce: interaction.nonce }
        )

        await expect(interactionRoutes.finish(ctx)).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.UnknownInteraction,
          message: 'unknown interaction'
        })
      })

      describe('Interactions for grant with finish method', (): void => {
        test('Can finish accepted interaction', async (): Promise<void> => {
          const grant = await Grant.query().insert(
            generateBaseGrant({
              tenantId: tenant.id,
              state: GrantState.Approved
            })
          )

          await Access.query().insert({
            ...BASE_GRANT_ACCESS,
            grantId: grant.id
          })

          const interaction = await Interaction.query().insert(
            generateBaseInteraction(grant, {
              state: InteractionState.Approved
            })
          )

          const ctx = createContext<FinishContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              session: {
                nonce: interaction.nonce
              },
              url: `/interact/${interaction.id}/${interaction.nonce}/finish`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          assert.ok(grant.finishUri)
          const clientRedirectUri = new URL(grant.finishUri)
          const { clientNonce } = grant
          const { nonce: interactNonce, ref: interactRef } = interaction

          const grantRequestUrl = config.authServerUrl + `/`

          const data = `${clientNonce}\n${interactNonce}\n${interactRef}\n${grantRequestUrl}`
          const hash = crypto
            .createHash('sha-256')
            .update(data)
            .digest('base64')
          clientRedirectUri.searchParams.set('hash', hash)
          assert.ok(interactRef)
          clientRedirectUri.searchParams.set('interact_ref', interactRef)

          const redirectSpy = jest.spyOn(ctx, 'redirect')

          await expect(interactionRoutes.finish(ctx)).resolves.toBeUndefined()
          expect(ctx.response).toSatisfyApiSpec()
          expect(ctx.status).toBe(302)
          expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())

          const issuedGrant = await Grant.query().findById(grant.id)
          assert.ok(issuedGrant)
          expect(issuedGrant.state).toEqual(GrantState.Approved)
        })

        test('Can finish rejected interaction', async (): Promise<void> => {
          const grant = await Grant.query().insert({
            ...generateBaseGrant({ tenantId: tenant.id }),
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Rejected
          })

          await Access.query().insert({
            ...BASE_GRANT_ACCESS,
            grantId: grant.id
          })

          const interaction = await Interaction.query().insert({
            ...generateBaseInteraction(grant),
            state: InteractionState.Denied
          })

          const ctx = createContext<FinishContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              session: {
                nonce: interaction.nonce
              },
              url: `/interact/${interaction.id}/${interaction.nonce}/finish`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          assert.ok(grant.finishUri)
          const clientRedirectUri = new URL(grant.finishUri)
          clientRedirectUri.searchParams.set('result', 'grant_rejected')

          const redirectSpy = jest.spyOn(ctx, 'redirect')

          await expect(interactionRoutes.finish(ctx)).resolves.toBeUndefined()
          expect(ctx.response).toSatisfyApiSpec()
          expect(ctx.status).toBe(302)
          expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())

          const rejectedGrant = await Grant.query().findById(grant.id)
          assert.ok(rejectedGrant)
          expect(rejectedGrant.state).toEqual(GrantState.Finalized)
          expect(rejectedGrant.finalizationReason).toEqual(
            GrantFinalization.Rejected
          )
        })

        test('Cannot finish invalid interaction', async (): Promise<void> => {
          const interaction = await Interaction.query().insert(
            generateBaseInteraction(grant, {
              state: InteractionState.Pending
            })
          )
          const ctx = createContext<FinishContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              session: {
                nonce: interaction.nonce
              },
              url: `/interact/${interaction.id}/${interaction.nonce}/finish`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          assert.ok(grant.finishUri)
          const clientRedirectUri = new URL(grant.finishUri)
          clientRedirectUri.searchParams.set('result', 'grant_invalid')

          const redirectSpy = jest.spyOn(ctx, 'redirect')

          await expect(interactionRoutes.finish(ctx)).resolves.toBeUndefined()
          expect(ctx.response).toSatisfyApiSpec()
          expect(ctx.status).toBe(302)
          expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())
        })

        test('Cannot finish interaction with revoked grant', async (): Promise<void> => {
          const grant = await Grant.query().insert(
            generateBaseGrant({
              tenantId: tenant.id,
              state: GrantState.Finalized,
              finalizationReason: GrantFinalization.Revoked
            })
          )

          assert.ok(grant.finishUri)
          const clientRedirectUri = new URL(grant.finishUri)
          clientRedirectUri.searchParams.set(
            'result',
            GNAPErrorCode.UnknownInteraction
          )
          clientRedirectUri.searchParams.set('message', 'unknown interaction')

          const interaction = await Interaction.query().insert(
            generateBaseInteraction(grant)
          )

          const ctx = createContext<FinishContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              session: { nonce: interaction.nonce },
              url: `/interact/${interaction.id}/${interaction.nonce}/finish`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          const redirectSpy = jest.spyOn(ctx, 'redirect')

          await expect(interactionRoutes.finish(ctx)).resolves.toBeUndefined()
          expect(ctx.response).toSatisfyApiSpec()
          expect(ctx.status).toBe(302)
          expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())
        })

        test('Cannot finish expired interaction', async (): Promise<void> => {
          assert.ok(grant.finishUri)
          const clientRedirectUri = new URL(grant.finishUri)
          clientRedirectUri.searchParams.set(
            'result',
            GNAPErrorCode.InvalidInteraction
          )
          clientRedirectUri.searchParams.set('message', 'interaction expired')
          const interactionCreatedDate = new Date(interaction.createdAt)
          const now = new Date(
            interactionCreatedDate.getTime() +
              (interaction.expiresIn + 1) * 1000
          )
          jest.useFakeTimers({ now })

          const ctx = createContext<FinishContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              session: { nonce: interaction.nonce },
              url: `/interact/${interaction.id}/${interaction.nonce}/finish`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          const redirectSpy = jest.spyOn(ctx, 'redirect')

          await expect(interactionRoutes.finish(ctx)).resolves.toBeUndefined()
          expect(ctx.response).toSatisfyApiSpec()
          expect(ctx.status).toBe(302)
          expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())
        })
      })

      describe('Interactions for grant without finish method', (): void => {
        let grantWithoutFinish: Grant
        beforeEach(async (): Promise<void> => {
          grantWithoutFinish = await Grant.query().insert(
            generateBaseGrant({ noFinishMethod: true, tenantId: tenant.id })
          )

          await Access.query().insert({
            ...BASE_GRANT_ACCESS,
            grantId: grantWithoutFinish.id
          })
        })

        test('Can finish approved interaction', async (): Promise<void> => {
          const interaction = await Interaction.query().insert(
            generateBaseInteraction(grantWithoutFinish, {
              state: InteractionState.Approved
            })
          )

          const ctx = createContext<FinishContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              session: {
                nonce: interaction.nonce
              },
              url: `/interact/${interaction.id}/${interaction.nonce}/finish`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          await expect(interactionRoutes.finish(ctx)).resolves.toBeUndefined()
          expect(ctx.response).toSatisfyApiSpec()
          expect(ctx.status).toBe(202)
        })

        test('Can finish rejected interaction', async (): Promise<void> => {
          const grant = await Grant.query().insert({
            ...generateBaseGrant({
              tenantId: tenant.id,
              noFinishMethod: true
            }),
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Rejected
          })

          await Access.query().insert({
            ...BASE_GRANT_ACCESS,
            grantId: grant.id
          })

          const interaction = await Interaction.query().insert(
            generateBaseInteraction(grant, {
              state: InteractionState.Denied
            })
          )

          const ctx = createContext<FinishContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              session: {
                nonce: interaction.nonce
              },
              url: `/interact/${interaction.id}/${interaction.nonce}/finish`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          await expect(interactionRoutes.finish(ctx)).resolves.toBeUndefined()
          expect(ctx.response).toSatisfyApiSpec()
          expect(ctx.status).toBe(202)
        })

        test('Cannot finish invalid interaction', async (): Promise<void> => {
          const grant = await Grant.query().insert({
            ...generateBaseGrant({
              tenantId: tenant.id,
              noFinishMethod: true
            }),
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Rejected
          })

          await Access.query().insert({
            ...BASE_GRANT_ACCESS,
            grantId: grant.id
          })

          const interaction = await Interaction.query().insert(
            generateBaseInteraction(grant, {
              state: InteractionState.Pending
            })
          )
          const ctx = createContext<FinishContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              session: {
                nonce: interaction.nonce
              },
              url: `/interact/${interaction.id}/${interaction.nonce}/finish`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          await expect(interactionRoutes.finish(ctx)).rejects.toMatchObject({
            status: 401,
            code: GNAPErrorCode.InvalidInteraction,
            message: 'interaction is not active'
          })
        })

        test('Cannot finish interaction with revoked grant', async (): Promise<void> => {
          const grant = await Grant.query().insert(
            generateBaseGrant({
              tenantId: tenant.id,
              noFinishMethod: true,
              state: GrantState.Finalized,
              finalizationReason: GrantFinalization.Revoked
            })
          )

          const interaction = await Interaction.query().insert(
            generateBaseInteraction(grant)
          )

          const ctx = createContext<FinishContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              session: { nonce: interaction.nonce },
              url: `/interact/${interaction.id}/${interaction.nonce}/finish`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          await expect(interactionRoutes.finish(ctx)).rejects.toMatchObject({
            status: 404,
            code: GNAPErrorCode.UnknownInteraction,
            message: 'unknown interaction'
          })
        })

        test('Cannot finish expired interaction', async (): Promise<void> => {
          const interaction = await Interaction.query().insert(
            generateBaseInteraction(grantWithoutFinish, {
              state: InteractionState.Approved
            })
          )
          const interactionCreatedDate = new Date(interaction.createdAt)
          const now = new Date(
            interactionCreatedDate.getTime() +
              (interaction.expiresIn + 1) * 1000
          )
          jest.useFakeTimers({ now })

          const ctx = createContext<FinishContext>(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              session: { nonce: interaction.nonce },
              url: `/interact/${interaction.id}/${interaction.nonce}/finish`
            },
            { id: interaction.id, nonce: interaction.nonce }
          )

          await expect(interactionRoutes.finish(ctx)).rejects.toMatchObject({
            status: 401,
            code: GNAPErrorCode.InvalidInteraction,
            message: 'interaction expired'
          })
        })
      })
    })

    describe('IDP - Grant details', (): void => {
      let tenant: Tenant
      let grant: Grant
      let access: Access
      let interaction: Interaction

      beforeEach(async (): Promise<void> => {
        tenant = await Tenant.query().insert(generateTenant())

        grant = await Grant.query().insert(
          generateBaseGrant({ tenantId: tenant.id })
        )

        access = await Access.query().insertAndFetch({
          ...BASE_GRANT_ACCESS,
          grantId: grant.id
        })

        interaction = await Interaction.query().insert(
          generateBaseInteraction(grant)
        )
      })

      test('Can get grant details', async (): Promise<void> => {
        const ctx = createContext<GetContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': tenant.idpSecret
            },
            url: `/grant/${interaction.id}/${interaction.nonce}`,
            method: 'GET'
          },
          { id: interaction.id, nonce: interaction.nonce }
        )

        await expect(interactionRoutes.details(ctx)).resolves.toBeUndefined()
        expect(ctx.status).toBe(200)
        expect(ctx.body).toEqual({
          grantId: grant.id,
          access: [
            {
              actions: access.actions,
              identifier: access.identifier,
              type: access.type
            }
          ],
          state: interaction.state,
          subject: undefined
        })
      })

      test('Cannot get grant details for nonexistent interaction', async (): Promise<void> => {
        const ctx = createContext<GetContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': tenant.idpSecret
            },
            url: `/grant/${interaction.id}/${interaction.nonce}`,
            method: 'GET'
          },
          { id: v4(), nonce: interaction.nonce }
        )
        await expect(interactionRoutes.details(ctx)).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.UnknownInteraction,
          message: 'unknown interaction'
        })
      })

      test('Cannot get grant details for revoked grant', async (): Promise<void> => {
        const revokedGrant = await Grant.query().insert(
          generateBaseGrant({
            tenantId: tenant.id,
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Revoked
          })
        )

        const interaction = await Interaction.query().insert(
          generateBaseInteraction(revokedGrant)
        )
        const ctx = createContext<GetContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': tenant.idpSecret
            },
            url: `/grant/${interaction.id}/${interaction.nonce}`,
            method: 'GET'
          },
          { id: interaction.id, nonce: interaction.nonce }
        )
        await expect(interactionRoutes.details(ctx)).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.UnknownInteraction,
          message: 'unknown interaction'
        })
      })

      test('Cannot get grant details without secret', async (): Promise<void> => {
        const ctx = createContext<GetContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            url: `/grant/${interaction.id}/${interaction.nonce}`,
            method: 'GET'
          },
          { id: interaction.id, nonce: interaction.nonce }
        )

        await expect(interactionRoutes.details(ctx)).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.InvalidRequest,
          message: 'invalid x-idp-secret'
        })
      })

      test('Cannot get grant details with invalid secret', async (): Promise<void> => {
        const ctx = createContext<GetContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': 'wrong-secret'
            },
            url: `/grant/${interaction.id}/${interaction.nonce}`,
            method: 'GET'
          },
          { id: interaction.id, nonce: interaction.nonce }
        )

        await expect(interactionRoutes.details(ctx)).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.InvalidRequest,
          message: 'invalid x-idp-secret'
        })
      })

      test('Cannot get grant details for nonexistent interaction', async (): Promise<void> => {
        const ctx = createContext<GetContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': tenant.idpSecret
            },
            url: `/grant/${interaction.id}/${interaction.nonce}`,
            method: 'GET'
          },
          { id: v4(), nonce: interaction.nonce }
        )
        await expect(interactionRoutes.details(ctx)).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.UnknownInteraction,
          message: 'unknown interaction'
        })
      })
    })
    describe('IDP - accept/reject interaction', (): void => {
      let pendingGrant: Grant
      beforeEach(async (): Promise<void> => {
        pendingGrant = await Grant.query().insert({
          ...generateBaseGrant({ tenantId: tenant.id }),
          state: GrantState.Pending
        })

        await Access.query().insert({
          ...BASE_GRANT_ACCESS,
          grantId: pendingGrant.id
        })
      })

      test('cannot accept/reject interaction with unconfigured tenant', async (): Promise<void> => {
        const unconfiguredTenant = await Tenant.query().insertAndFetch({
          apiSecret: v4(),
          idpConsentUrl: undefined,
          idpSecret: undefined
        })

        const grant = await Grant.query().insert(
          generateBaseGrant({ tenantId: unconfiguredTenant.id })
        )

        const interaction = await Interaction.query().insert(
          generateBaseInteraction(grant)
        )

        const ctx = createContext<ChooseContext>(
          {
            url: `/grant/${interaction.id}/${interaction.nonce}/accept`,
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': tenant.idpSecret
            }
          },
          {
            id: interaction.id,
            nonce: interaction.nonce,
            choice: InteractionChoices.Accept
          }
        )

        await expect(
          interactionRoutes.acceptOrReject(ctx)
        ).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.UnknownInteraction,
          message: 'unknown interaction'
        })
      })

      test('cannot accept/reject interaction without secret', async (): Promise<void> => {
        const ctx = createContext<ChooseContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          },
          {
            id: interaction.id,
            nonce: interaction.nonce,
            choice: InteractionChoices.Accept
          }
        )

        await expect(
          interactionRoutes.acceptOrReject(ctx)
        ).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.InvalidInteraction,
          message: 'invalid x-idp-secret'
        })
      })

      test('cannot accept/reject interacetion with invalid secret', async (): Promise<void> => {
        const ctx = createContext<ChooseContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': 'wrong-secret'
            }
          },
          {
            id: interaction.id,
            nonce: interaction.nonce,
            choice: InteractionChoices.Accept
          }
        )

        await expect(
          interactionRoutes.acceptOrReject(ctx)
        ).rejects.toMatchObject({
          status: 401,
          code: GNAPErrorCode.InvalidInteraction,
          message: 'invalid x-idp-secret'
        })
      })

      test('can accept interaction', async (): Promise<void> => {
        const ctx = createContext<ChooseContext>(
          {
            url: `/grant/${interaction.id}/${interaction.nonce}/accept`,
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': tenant.idpSecret
            }
          },
          {
            id: interaction.id,
            nonce: interaction.nonce,
            choice: InteractionChoices.Accept
          }
        )

        await expect(
          interactionRoutes.acceptOrReject(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(202)

        const issuedGrant = await Grant.query().findById(pendingGrant.id)
        const acceptedInteraction = await Interaction.query().findById(
          interaction.id
        )
        assert.ok(issuedGrant)
        assert.ok(acceptedInteraction)
        expect(issuedGrant.state).toEqual(GrantState.Pending)
        expect(acceptedInteraction.state).toEqual(InteractionState.Approved)
      })

      test('Cannot accept or reject grant if grant does not exist', async (): Promise<void> => {
        const interactId = v4()
        const nonce = generateNonce()
        const ctx = createContext<ChooseContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': tenant.idpSecret
            }
          },
          { id: interactId, nonce }
        )

        await expect(
          interactionRoutes.acceptOrReject(ctx)
        ).rejects.toMatchObject({
          status: 404,
          code: GNAPErrorCode.UnknownInteraction,
          message: 'unknown interaction'
        })
      })

      test('Can reject grant', async (): Promise<void> => {
        const ctx = createContext<ChooseContext>(
          {
            url: `/grant/${interaction.id}/${interaction.nonce}/reject`,
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': tenant.idpSecret
            }
          },
          {
            id: interaction.id,
            nonce: interaction.nonce,
            choice: InteractionChoices.Reject
          }
        )

        await expect(
          interactionRoutes.acceptOrReject(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(202)

        const issuedGrant = await Grant.query().findById(pendingGrant.id)
        assert.ok(issuedGrant)
        expect(issuedGrant.state).toEqual(GrantState.Pending)

        const rejectedInteraction = await Interaction.query().findById(
          interaction.id
        )
        assert.ok(rejectedInteraction)
        expect(rejectedInteraction.state).toEqual(InteractionState.Denied)
      })

      test('Cannot make invalid grant choice', async (): Promise<void> => {
        const ctx = createContext<ChooseContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': tenant.idpSecret
            }
          },
          {
            id: interaction.id,
            nonce: interaction.nonce,
            choice: 'invalidChoice'
          }
        )

        await expect(
          interactionRoutes.acceptOrReject(ctx)
        ).rejects.toMatchObject({
          status: 400,
          code: GNAPErrorCode.InvalidRequest,
          message: 'invalid interaction choice'
        })

        const issuedGrant = await Grant.query().findById(pendingGrant.id)
        assert.ok(issuedGrant)
        expect(issuedGrant.state).toEqual(GrantState.Pending)

        const stillActiveInteraction = await Interaction.query().findById(
          interaction.id
        )
        assert.ok(stillActiveInteraction)
        expect(stillActiveInteraction.state).toEqual(InteractionState.Pending)
      })
    })
  })
})
