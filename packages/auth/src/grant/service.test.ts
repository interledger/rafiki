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
import {
  Grant,
  StartMethod,
  FinishMethod,
  GrantState,
  GrantFinalization
} from '../grant/model'
import { Access } from '../access/model'
import { generateNonce, generateToken } from '../shared/utils'
import { AccessType, AccessAction } from '@interledger/open-payments'
import { createGrant } from '../tests/grant'
import { AccessToken } from '../accessToken/model'
import { Interaction, InteractionState } from '../interaction/model'
import { Pagination, SortOrder } from '../shared/baseModel'
import { getPageTests } from '../shared/baseModel.test'
import { Tenant } from '../tenant/model'
import { generateTenant } from '../tests/tenant'

describe('Grant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grantService: GrantService
  let knex: Knex
  let tenant: Tenant

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    grantService = await deps.use('grantService')
  })

  beforeEach(async (): Promise<void> => {
    tenant = await Tenant.query().insertAndFetch(generateTenant())
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getPage', (): void => {
    getPageTests({
      createModel: () => createGrant(deps, tenant.id),
      getPage: (pagination?: Pagination, sortOrder?: SortOrder) =>
        grantService.getPage(pagination, undefined, sortOrder)
    })
  })

  describe('grant flow', (): void => {
    let tenant: Tenant
    let grant: Grant
    let access: Access
    let accessToken: AccessToken

    const CLIENT = faker.internet.url({ appendSlash: false })

    beforeEach(async (): Promise<void> => {
      tenant = await Tenant.query().insert(generateTenant())
      grant = await Grant.query().insert({
        state: GrantState.Processing,
        startMethod: [StartMethod.Redirect],
        continueToken: generateToken(),
        continueId: v4(),
        finishMethod: FinishMethod.Redirect,
        finishUri: 'https://example.com',
        clientNonce: generateNonce(),
        client: CLIENT,
        tenantId: tenant.id
      })

      await Interaction.query().insert({
        ref: v4(),
        nonce: generateNonce(),
        state: InteractionState.Pending,
        expiresIn: Config.interactionExpirySeconds,
        grantId: grant.id
      })

      access = await Access.query().insert({
        ...BASE_GRANT_ACCESS,
        type: AccessType.IncomingPayment,
        grantId: grant.id
      })

      accessToken = await AccessToken.query().insert({
        value: generateToken(),
        managementId: v4(),
        expiresIn: 10_000_000,
        grantId: grant.id
      })
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

        const grant = await grantService.create(grantRequest, tenant.id)

        expect(grant).toMatchObject({
          state: GrantState.Approved,
          continueId: expect.any(String),
          continueToken: expect.any(String),
          finishMethod: FinishMethod.Redirect,
          finishUri: BASE_GRANT_REQUEST.interact.finish.uri,
          clientNonce: BASE_GRANT_REQUEST.interact.finish.nonce,
          client: CLIENT,
          startMethod: expect.arrayContaining([StartMethod.Redirect])
        })

        await expect(
          Access.query(knex)
            .where({
              grantId: grant.id
            })
            .first()
        ).resolves.toMatchObject({
          type: AccessType.IncomingPayment
        })
      })

      test.each`
        type                          | expectedState          | interact
        ${AccessType.IncomingPayment} | ${GrantState.Approved} | ${undefined}
        ${AccessType.Quote}           | ${GrantState.Approved} | ${undefined}
        ${AccessType.OutgoingPayment} | ${GrantState.Pending}  | ${BASE_GRANT_REQUEST.interact}
      `(
        'Puts $type grant without interaction in $expectedState state',
        async ({ type, expectedState, interact }): Promise<void> => {
          const grantRequest: GrantRequest = {
            ...BASE_GRANT_REQUEST,
            access_token: {
              access: [
                {
                  ...BASE_GRANT_ACCESS,
                  type
                }
              ]
            },
            interact
          }

          const grant = await grantService.create(grantRequest, tenant.id)

          expect(grant).toMatchObject({
            state: expectedState,
            continueId: expect.any(String),
            continueToken: expect.any(String)
          })

          await expect(
            Access.query(knex)
              .where({
                grantId: grant.id
              })
              .first()
          ).resolves.toMatchObject({
            type
          })
        }
      )

      it('create a grant with subject in pending state', async () => {
        const grantRequest: GrantRequest = {
          ...BASE_GRANT_REQUEST,
          subject: {
            sub_ids: [
              {
                id: faker.internet.url(),
                format: 'uri'
              }
            ]
          }
        }

        const grant = await grantService.create(grantRequest, tenant.id)

        expect(grant).toMatchObject({
          state: GrantState.Pending,
          continueId: expect.any(String),
          continueToken: expect.any(String)
        })
      })
    })

    describe('pending', (): void => {
      test('Can mark a grant pending for an interaction', async (): Promise<void> => {
        const pendingGrant = await grantService.markPending(grant.id)
        assert.ok(pendingGrant)
        expect(pendingGrant.state).toEqual(GrantState.Pending)
      })
    })

    describe('issue', (): void => {
      test('Can issue an approved grant', async (): Promise<void> => {
        const issuedGrant = await grantService.approve(grant.id)
        expect(issuedGrant.state).toEqual(GrantState.Approved)
      })
    })

    describe('continue', (): void => {
      test('Can fetch a grant by its continuation information', async (): Promise<void> => {
        const { continueId, continueToken } = grant

        const fetchedGrant = await grantService.getByContinue(
          continueId,
          continueToken
        )
        expect(fetchedGrant?.id).toEqual(grant.id)
        expect(fetchedGrant?.continueId).toEqual(continueId)
        expect(fetchedGrant?.continueToken).toEqual(continueToken)
      })

      test('Defaults to excluding revoked grants', async (): Promise<void> => {
        await grant.$query().patch({
          state: GrantState.Finalized,
          finalizationReason: GrantFinalization.Revoked
        })

        const { continueId, continueToken } = grant

        const fetchedGrant = await grantService.getByContinue(
          continueId,
          continueToken
        )
        expect(fetchedGrant).toBeUndefined()
      })

      test('Can fetch revoked grants with includeRevoked', async (): Promise<void> => {
        await grant.$query().patch({
          state: GrantState.Finalized,
          finalizationReason: GrantFinalization.Revoked
        })

        const { continueId, continueToken } = grant

        const fetchedGrant = await grantService.getByContinue(
          continueId,
          continueToken,
          { includeRevoked: true }
        )
        expect(fetchedGrant?.id).toEqual(grant.id)
        expect(fetchedGrant?.continueId).toEqual(continueId)
        expect(fetchedGrant?.continueToken).toEqual(continueToken)
      })

      test('properly fetches grant by continuation information with multiple existing grants', async (): Promise<void> => {
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

        const grant1 = await grantService.create(grantRequest, tenant.id)
        await grant1
          .$query()
          .patch({ finalizationReason: GrantFinalization.Issued })

        const grant2 = await grantService.create(grantRequest, tenant.id)
        const grant3 = await grantService.create(grantRequest, tenant.id)
        await grant3
          .$query()
          .patch({ finalizationReason: GrantFinalization.Revoked })

        const fetchedGrant1 = await grantService.getByContinue(
          grant1.continueId,
          grant1.continueToken
        )

        expect(fetchedGrant1?.id).toEqual(grant1.id)
        expect(fetchedGrant1?.continueId).toEqual(grant1.continueId)
        expect(fetchedGrant1?.continueToken).toEqual(grant1.continueToken)

        const fetchedGrant2 = await grantService.getByContinue(
          grant2.continueId,
          grant2.continueToken
        )

        expect(fetchedGrant2?.id).toEqual(grant2.id)
        expect(fetchedGrant2?.continueId).toEqual(grant2.continueId)
        expect(fetchedGrant2?.continueToken).toEqual(grant2.continueToken)

        await expect(
          grantService.getByContinue(grant3.continueId, grant3.continueToken)
        ).resolves.toBeUndefined()
      })
    })

    describe('getByIdWithAccessAndSubject', (): void => {
      test('Can fetch a grant by id with access', async () => {
        const grantRequest: GrantRequest = {
          ...BASE_GRANT_REQUEST,
          subject: {
            sub_ids: [
              {
                id: faker.internet.url(),
                format: 'uri'
              }
            ]
          },
          access_token: {
            access: [
              {
                ...BASE_GRANT_ACCESS,
                type: AccessType.IncomingPayment
              }
            ]
          }
        }

        const grant = await grantService.create(grantRequest, tenant.id)
        expect(grant?.id).toBeDefined()

        const fetchedGrant = await grantService.getByIdWithAccessAndSubject(
          grant.id
        )
        expect(fetchedGrant?.id).toEqual(grant.id)
        expect(fetchedGrant?.subjects?.length).toBeGreaterThan(0)
        expect(fetchedGrant?.access?.length).toBeGreaterThan(0)
      })

      test('Can filter by tenantId', async () => {
        const fetchedGrant = await grantService.getByIdWithAccessAndSubject(
          grant.id,
          grant.tenantId
        )
        expect(fetchedGrant?.id).toEqual(grant.id)
        expect(fetchedGrant?.access?.length).toBeGreaterThan(0)
      })

      test('Returns undefined if incorrect tenantId', async () => {
        const fetchedGrant = await grantService.getByIdWithAccessAndSubject(
          grant.id,
          v4()
        )
        expect(fetchedGrant).toBeUndefined()
      })
    })

    describe('finalize', (): void => {
      test.each`
        reason                        | description
        ${GrantFinalization.Issued}   | ${'issued'}
        ${GrantFinalization.Rejected} | ${'rejectd'}
        ${GrantFinalization.Revoked}  | ${'revoked'}
      `(
        'Can finalize a grant that is $description',
        async ({ reason }): Promise<void> => {
          const finalizedGrant = await grantService.finalize(grant.id, reason)
          expect(finalizedGrant.id).toEqual(grant.id)
          expect(finalizedGrant.state).toEqual(GrantState.Finalized)
          expect(finalizedGrant.finalizationReason).toEqual(reason)
        }
      )

      test('Cannot finalize a grant that does not exist', async (): Promise<void> => {
        const finalizedGrant = await grantService.finalize(
          v4(),
          GrantFinalization.Issued
        )
        expect(finalizedGrant).toBeUndefined()
      })
    })

    describe('updateLastContinuedAt', (): void => {
      test("Can update a grant's last continue attempt timestamp", async (): Promise<void> => {
        const updatedGrant = await grantService.updateLastContinuedAt(grant.id)

        expect(updatedGrant.lastContinuedAt.getTime()).toBeGreaterThan(
          grant.lastContinuedAt.getTime()
        )
      })
    })

    describe('revoke', (): void => {
      test('Can revoke a grant', async (): Promise<void> => {
        await expect(
          grantService.revokeGrant(grant.id, tenant.id)
        ).resolves.toEqual(true)

        const revokedGrant = await Grant.query(knex).findById(grant.id)
        expect(revokedGrant?.state).toEqual(GrantState.Finalized)
        expect(revokedGrant?.finalizationReason).toEqual(
          GrantFinalization.Revoked
        )
        expect(Access.query().where({ grantId: grant.id })).resolves.toEqual([
          { ...access, limits: null }
        ])
        expect(
          AccessToken.query().where({ grantId: grant.id })
        ).resolves.toEqual([
          {
            ...accessToken,
            revokedAt: expect.any(Date),
            updatedAt: expect.any(Date)
          }
        ])
      })

      test('Can "revoke" unknown grant', async (): Promise<void> => {
        await expect(
          grantService.revokeGrant(v4(), tenant.id)
        ).resolves.toEqual(false)
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

        const grant = await grantService.create(grantRequest, tenant.id)

        const timeoutMs = 50

        const lock = async (): Promise<void> => {
          return await Grant.transaction(async (knex) => {
            await grantService.lock(grant.id, knex, timeoutMs)
            await new Promise((resolve) => setTimeout(resolve, timeoutMs + 10))
            await Grant.query(knex).findById(grant.id)
          })
        }
        await expect(Promise.all([lock(), lock()])).rejects.toThrowError(
          /Defined query timeout/
        )
      })
    })
  })

  describe('getGrantsPage', (): void => {
    let grants: Grant[] = []
    const walletAddress = 'example.com/test'

    beforeEach(async () => {
      const secondTenant = await Tenant.query().insertAndFetch(generateTenant())
      const grantDetails = [
        {
          identifier: walletAddress,
          state: GrantState.Finalized,
          finalizationReason: GrantFinalization.Revoked,
          tenantId: tenant.id
        },
        {
          identifier: walletAddress,
          state: GrantState.Pending,
          tenantId: tenant.id
        },
        {
          identifier: 'example.com/test3',
          state: GrantState.Pending,
          tenantId: secondTenant.id
        }
      ]

      for (const {
        identifier,
        state,
        finalizationReason,
        tenantId
      } of grantDetails) {
        const grant = await createGrant(deps, tenantId, { identifier })
        const updatedGrant = await grant
          .$query()
          .patchAndFetch({ state, finalizationReason })
        grants.push(updatedGrant)
      }
    })

    afterEach(async () => {
      grants = []
    })

    test('No filter gets all', async (): Promise<void> => {
      const grantPage = await grantService.getPage()
      expect(grantPage.length).toBe(grants.length)
    })

    test('Can paginate and filter', async (): Promise<void> => {
      const filter = { identifier: { in: [walletAddress] } }
      const page = await grantService.getPage(
        {
          first: 1,
          after: grants?.[1].id
        },
        filter
      )

      expect(page[0].id).toBe(grants?.[0].id)
      expect(page.length).toBe(1)
    })

    describe('SortOrder', () => {
      test('ASC', async () => {
        const fetchedGrants = await grantService.getPage(
          undefined,
          undefined,
          SortOrder.Asc
        )

        expect(fetchedGrants[0].id).toBe(grants[0].id)
      })

      test('DESC', async () => {
        const fetchedGrants = await grantService.getPage(
          undefined,
          undefined,
          SortOrder.Desc
        )

        expect(fetchedGrants[0].id).toBe(grants[grants.length - 1].id)
      })
    })

    describe('GrantFilter', () => {
      describe('identifier', () => {
        test('in', async () => {
          const fetchedGrants = await grantService.getPage(undefined, {
            identifier: {
              in: [walletAddress]
            }
          })

          expect(fetchedGrants.length).toBe(2)
        })
      })

      describe('state', () => {
        test('in', async () => {
          const fetchedGrants = await grantService.getPage(undefined, {
            state: {
              in: [GrantState.Finalized]
            }
          })

          expect(fetchedGrants.length).toBe(1)
        })
        test('notIn', async () => {
          const fetchedGrants = await grantService.getPage(undefined, {
            state: {
              notIn: [GrantState.Finalized]
            }
          })

          expect(fetchedGrants.length).toBe(2)
        })
      })

      describe('finalizationReason', () => {
        test('in', async () => {
          const fetchedGrants = await grantService.getPage(undefined, {
            finalizationReason: {
              in: [GrantFinalization.Revoked]
            }
          })

          expect(fetchedGrants.length).toBe(1)
        })
        test('notIn', async () => {
          const fetchedGrants = await grantService.getPage(undefined, {
            finalizationReason: {
              notIn: [GrantFinalization.Revoked]
            }
          })

          expect(fetchedGrants.length).toBe(2)
        })
      })
    })

    test('Can filter by tenantId', async (): Promise<void> => {
      const page = await grantService.getPage(
        undefined,
        undefined,
        undefined,
        tenant.id
      )

      expect(page.length).toBe(2)
      expect(page.every((result) => result.tenantId === tenant.id)).toBeTruthy()
    })
  })
})
