import { faker } from '@faker-js/faker'
import { v4 } from 'uuid'
import * as crypto from 'crypto'
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
  GrantChoices,
  StartContext,
  FinishContext,
  GetContext,
  ChooseContext
} from './routes'
import { Grant, StartMethod, FinishMethod, GrantState, GrantFinalization } from '../grant/model'
import { Access } from '../access/model'
import { generateNonce, generateToken } from '../shared/utils'

const CLIENT = faker.internet.url({ appendSlash: false })

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

    interactionRoutes = await deps.use('interactionRoutes')
    config = await deps.use('config')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
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

        await expect(interactionRoutes.start(ctx)).rejects.toMatchObject({
          status: 401,
          error: 'unknown_request'
        })
      })

      test('Interaction start fails if grant is revoked', async (): Promise<void> => {
        const grant = await Grant.query().insert({
          ...generateBaseGrant(),
          state: GrantState.Finalized,
          finalizationReason: GrantFinalization.Revoked
        })

        const ctx = createContext<StartContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          },
          { id: grant.interactId, nonce: grant.interactNonce }
        )

        await expect(interactionRoutes.start(ctx)).rejects.toMatchObject({
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

        await expect(interactionRoutes.start(ctx)).resolves.toBeUndefined()
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

        await expect(interactionRoutes.finish(ctx)).rejects.toMatchObject({
          status: 404,
          error: 'unknown_request'
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
          { nonce: grant.interactNonce, id: grant.interactId }
        )

        await expect(interactionRoutes.finish(ctx)).rejects.toMatchObject({
          status: 401,
          error: 'invalid_request'
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
            session: { nonce: grant.interactNonce }
          },
          { id: fakeInteractId, nonce: grant.interactNonce }
        )

        await expect(interactionRoutes.finish(ctx)).rejects.toMatchObject({
          status: 404,
          error: 'unknown_request'
        })
      })

      test('Cannot finish interaction with revoked grant', async (): Promise<void> => {
        const grant = await Grant.query().insert({
          ...generateBaseGrant(),
          state: GrantState.Finalized,
          finalizationReason: GrantFinalization.Revoked
        })

        const ctx = createContext<FinishContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            session: { nonce: grant.interactNonce }
          },
          { id: grant.interactId, nonce: grant.interactNonce }
        )

        await expect(interactionRoutes.finish(ctx)).rejects.toMatchObject({
          status: 404,
          error: 'unknown_request'
        })
      })

      test('Can finish accepted interaction', async (): Promise<void> => {
        const grant = await Grant.query().insert({
          ...generateBaseGrant(),
          state: GrantState.Approved
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

        await expect(interactionRoutes.finish(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(302)
        expect(redirectSpy).toHaveBeenCalledWith(clientRedirectUri.toString())
      })

      test('Can finish rejected interaction', async (): Promise<void> => {
        const grant = await Grant.query().insert({
          ...generateBaseGrant(),
          state: GrantState.Finalized,
          finalizationReason: GrantFinalization.Rejected
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

        await expect(interactionRoutes.finish(ctx)).resolves.toBeUndefined()
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

        await expect(interactionRoutes.finish(ctx)).resolves.toBeUndefined()
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

        await expect(interactionRoutes.details(ctx)).resolves.toBeUndefined()
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
        await expect(interactionRoutes.details(ctx)).rejects.toMatchObject({
          status: 404
        })
      })

      test('Cannot get grant details for revoked grant', async (): Promise<void> => {
        const revokedGrant = await Grant.query().insert({
          ...generateBaseGrant(),
          state: GrantState.Finalized,
          finalizationReason: GrantFinalization.Revoked
        })
        const ctx = createContext<GetContext>(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-idp-secret': Config.identityServerSecret
            },
            url: `/grant/${revokedGrant.interactId}/${revokedGrant.interactNonce}`,
            method: 'GET'
          },
          { id: revokedGrant.interactId, nonce: revokedGrant.interactNonce }
        )
        await expect(interactionRoutes.details(ctx)).rejects.toMatchObject({
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

        await expect(interactionRoutes.details(ctx)).rejects.toMatchObject({
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
        await expect(interactionRoutes.details(ctx)).rejects.toMatchObject({
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

        await expect(interactionRoutes.details(ctx)).rejects.toMatchObject({
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
          interactionRoutes.acceptOrReject(ctx)
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
          interactionRoutes.acceptOrReject(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(202)

        const issuedGrant = await Grant.query().findById(grant.id)
        assert.ok(issuedGrant)
        expect(issuedGrant.state).toEqual(GrantState.Approved)
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
          interactionRoutes.acceptOrReject(ctx)
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
          interactionRoutes.acceptOrReject(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.status).toBe(202)

        const issuedGrant = await Grant.query().findById(grant.id)
        assert.ok(issuedGrant)
        expect(issuedGrant.state).toEqual(GrantState.Finalized)
        expect(issuedGrant.finalizationReason).toEqual(
          GrantFinalization.Rejected
        )
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
          interactionRoutes.acceptOrReject(ctx)
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
