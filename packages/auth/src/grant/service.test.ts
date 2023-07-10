import assert from 'assert'
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
import { Access } from '../access/model'
import { generateNonce, generateToken } from '../shared/utils'
import { AccessType, AccessAction } from '@interledger/open-payments'
import { createGrant } from '../tests/grant'

describe('Grant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grantService: GrantService
  let trx: Knex.Transaction
  let grant: Grant

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)

    grantService = await deps.use('grantService')
  })

  const CLIENT = faker.internet.url({ appendSlash: false })

  beforeEach(async (): Promise<void> => {
    grant = await Grant.query().insert({
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

    await Access.query().insert({
      ...BASE_GRANT_ACCESS,
      type: AccessType.IncomingPayment,
      grantId: grant.id
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  const BASE_GRANT_ACCESS = {
    actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
    identifier: `https://example.com/${v4()}`
  }

  const BASE_GRANT_REQUEST = {
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

  describe('create', (): void => {
    test('Can initiate a grant', async (): Promise<void> => {
      const grantRequest: GrantRequest = {
        ...BASE_GRANT_REQUEST,
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
        continueToken: expect.any(String)
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
    test('Cannot fetch non-existing grant', async () => {
      await expect(grantService.get(v4())).resolves.toBeUndefined()
      await expect(grantService.getByInteraction(v4())).resolves.toBeUndefined()
    })

    test('Can fetch a grant by id with access', async () => {
      const fetchedGrant = await grantService.getByIdWithAccess(grant.id)
      expect(fetchedGrant?.id).toEqual(grant.id)
      expect(fetchedGrant?.access?.length).toBeGreaterThan(0)
    })
  })

  describe('getByInteractiveSession', (): void => {
    test('Can fetch a grant by interact id and nonce', async () => {
      assert.ok(grant.interactId)
      assert.ok(grant.interactNonce)
      const fetchedGrant = await grantService.getByInteractionSession(
        grant.interactId,
        grant.interactNonce
      )
      expect(fetchedGrant?.id).toEqual(grant.id)
    })
    test.each`
      interactId | interactNonce | description
      ${true}    | ${false}      | ${'interactId'}
      ${false}   | ${true}       | ${'interactNonce'}
      ${false}   | ${false}      | ${'interactId and interactNonce'}
    `(
      'Cannot fetch a grant by unknown $description',
      async ({ interactId, interactNonce }): Promise<void> => {
        assert.ok(grant.interactId)
        assert.ok(grant.interactNonce)

        await expect(
          grantService.getByInteractionSession(
            interactId ? grant.interactId : v4(),
            interactNonce ? grant.interactNonce : v4()
          )
        ).resolves.toBeUndefined()
      }
    )
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

  describe('revoke', (): void => {
    test('Can revoke a grant', async (): Promise<void> => {
      await expect(grantService.revokeGrant(grant.continueId)).resolves.toEqual(
        true
      )
      
      const revokedGrant = await grantService.get(grant.id)
      expect(revokedGrant?.state).toEqual(GrantState.Revoked)
    })

    test('Can "revoke" unknown grant', async (): Promise<void> => {
      await expect(grantService.revokeGrant(v4())).resolves.toEqual(false)
    })

    test('Can revoke a grant by grant ID', async (): Promise<void> => {
      await expect(grantService.revokeGrantById(grant.id)).resolves.toEqual(
        true
      )
      
      const revokedGrant = await grantService.get(grant.id)
      expect(revokedGrant?.state).toEqual(GrantState.Revoked)
    })

    test('Can "revoke" unknown grant by grant ID', async (): Promise<void> => {
      await expect(grantService.revokeGrantById(v4())).resolves.toEqual(false)
    })
  })

  describe('lock', (): void => {
    test('a grant reference can be locked', async (): Promise<void> => {
      const grantRequest: GrantRequest = {
        ...BASE_GRANT_REQUEST,
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

      const timeoutMs = 50

      const lock = async (): Promise<void> => {
        return await Grant.transaction(async (trx) => {
          await grantService.lock(grant.id, trx, timeoutMs)
          await new Promise((resolve) => setTimeout(resolve, timeoutMs + 10))
          await grantService.get(grant.id)
        })
      }
      await expect(Promise.all([lock(), lock()])).rejects.toThrowError(
        /Defined query timeout/
      )
    })
  })

  describe('getGrantsPage', (): void => {
    let grants: Grant[] = []
    const paymentPointer = 'example.com/test'

    beforeEach(async () => {
      for (const identifier of [
        paymentPointer,
        paymentPointer,
        'example.com/test3'
      ]) {
        grants.push(await createGrant(deps, { identifier }))
      }
    })

    afterEach(async () => {
      grants = []
    })

    test('No filter gets all', async (): Promise<void> => {
      const grants = await grantService.getPage()
      const allGrants = await Grant.query()
      expect(grants.length).toBe(allGrants.length)
    })

    test('Filter by identifier', async () => {
      const grants = await grantService.getPage(undefined, {
        identifier: {
          in: [paymentPointer]
        }
      })

      expect(grants.length).toBe(2)
    })

    test('Can paginate and filter', async (): Promise<void> => {
      const filter = { identifier: { in: [paymentPointer] } }
      const page = await grantService.getPage(
        {
          first: 1,
          after: grants?.[0].id
        },
        filter
      )

      expect(page[0].id).toBe(grants?.[1].id)
      expect(page.length).toBe(1)
    })
  })
})
