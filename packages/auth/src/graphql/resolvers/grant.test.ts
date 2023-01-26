import assert from 'assert'
import { gql } from 'apollo-server-koa'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
  GrantsConnection,
  RevokeGrantInput,
  RevokeGrantMutationResponse
} from '../generated/graphql'
import { Grant as GrantModel } from '../../grant/model'
import { generateToken } from '../../shared/utils'
import { Access } from '../../access/model'
import { AccessAction, AccessType } from 'open-payments'
import { getPageTests } from './page.test'
import { GrantService } from '../../grant/service'
import { createGrant, getGrantRequest } from '../../tests/grant'

describe('Grant Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grantService: GrantService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)

    grantService = await deps.use('grantService')
  })

  const BASE_GRANT_ACCESS = {
    actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
    identifier: `https://example.com/${uuid()}`
  }

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Grants Queries', (): void => {
    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        grantService.create(getGrantRequest()) as Promise<GrantModel>,
      pagedQuery: 'grants'
    })

    test('Can get grants', async (): Promise<void> => {
      const grants: GrantModel[] = []
      for (let i = 0; i < 2; i++) {
        const grant = await grantService.create(getGrantRequest())
        grants.push(grant)
      }
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query grants {
              grants {
                edges {
                  node {
                    id
                    state
                  }
                  cursor
                }
              }
            }
          `
        })
        .then((query): GrantsConnection => {
          if (query.data) {
            return query.data.grants
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        const grant = grants[idx]
        expect(edge.cursor).toEqual(grant.id)
        expect(edge.node).toEqual({
          __typename: 'Grant',
          id: grant.id,
          state: grant.state
        })
      })
    })
  })

  describe('Revoke key', (): void => {
    let grant: GrantModel
    beforeEach(async (): Promise<void> => {
      grant = await createGrant()

      await Access.query().insert({
        ...BASE_GRANT_ACCESS,
        type: AccessType.IncomingPayment,
        grantId: grant.id
      })
    })

    test('Can revoke a grant', async (): Promise<void> => {
      const input: RevokeGrantInput = {
        continueId: grant.continueId,
        continueToken: grant.continueToken
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeGrant($input: RevokeGrantInput!) {
              revokeGrant(input: $input) {
                code
                success
                message
                grant {
                  id
                  state
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): RevokeGrantMutationResponse => {
          if (query.data) {
            return query.data.revokeGrant
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toBe('204')
      assert.ok(response.grant)
    })

    test('Returns 404 if id does not exist', async (): Promise<void> => {
      const input: RevokeGrantInput = {
        continueId: uuid(),
        continueToken: generateToken()
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeGrant($input: RevokeGrantInput!) {
              revokeGrant(input: $input) {
                code
                success
                message
                grant {
                  id
                  state
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): RevokeGrantMutationResponse => {
          if (query.data) {
            return query.data.revokeGrant
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toBe('404')
      expect(response.message).toBe('There is not grant with this parameters')
      expect(response.grant).toBeNull()
    })
  })
})
