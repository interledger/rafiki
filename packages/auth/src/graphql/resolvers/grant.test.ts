import { ApolloError, ApolloQueryResult, gql } from '@apollo/client'
import { v4 as uuid } from 'uuid'
import assert from 'assert'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
  GrantFinalization,
  GrantsConnection,
  GrantState,
  Query,
  RevokeGrantInput,
  RevokeGrantMutationResponse
} from '../generated/graphql'
import { Grant, Grant as GrantModel } from '../../grant/model'
import { getPageTests } from './page.test'
import { createGrant } from '../../tests/grant'
import { GraphQLErrorCode } from '../errors'
import { Tenant } from '../../tenant/model'
import { generateTenant } from '../../tests/tenant'

const responseHandler = (query: ApolloQueryResult<Query>): GrantsConnection => {
  if (query.data) {
    return query.data.grants
  } else {
    throw new Error('Data was empty')
  }
}

describe('Grant Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let tenant: Tenant

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  beforeEach(async (): Promise<void> => {
    tenant = await Tenant.query().insertAndFetch(generateTenant())
  })

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
      createModel: () => createGrant(deps, tenant.id) as Promise<GrantModel>,
      pagedQuery: 'grants'
    })

    test('Can get grants', async (): Promise<void> => {
      const grants: GrantModel[] = []

      for (let i = 0; i < 2; i++) {
        grants[1 - i] = await createGrant(deps, tenant.id)
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

    describe('Can order grants', (): void => {
      let grants: GrantModel[] = []
      beforeEach(async () => {
        const identifier = 'https://example.com/test'
        const grantData = [
          { identifier },
          { identifier },
          { identifier: 'https://abc.com/xyz' }
        ]
        for (const { identifier } of grantData) {
          const grant = await createGrant(deps, tenant.id, { identifier })
          grants.push(grant)
        }
      })

      afterEach(() => {
        grants = []
      })

      test('ASC', async (): Promise<void> => {
        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query grants($sortOrder: SortOrder) {
                grants(sortOrder: $sortOrder) {
                  edges {
                    node {
                      id
                      state
                    }
                    cursor
                  }
                }
              }
            `,
            variables: { sortOrder: 'ASC' }
          })
          .then(responseHandler)
        expect(query.edges[0].node.id).toBe(grants[0].id)
      })

      test('DESC', async (): Promise<void> => {
        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query grants($sortOrder: SortOrder) {
                grants(sortOrder: $sortOrder) {
                  edges {
                    node {
                      id
                      state
                    }
                    cursor
                  }
                }
              }
            `,
            variables: { sortOrder: 'DESC' }
          })
          .then(responseHandler)
        expect(query.edges[0].node.id).toBe(grants[grants.length - 1].id)
      })
    })

    describe('Can filter grants', (): void => {
      test('identifier', async (): Promise<void> => {
        const grants: GrantModel[] = []
        const identifier = 'https://example.com/test'
        const grantData = [
          { identifier },
          { identifier },
          { identifier: 'https://abc.com/xyz' }
        ]
        for (const { identifier } of grantData) {
          const grant = await createGrant(deps, tenant.id, { identifier })
          grants.push(grant)
        }

        const filteredGrants = grants.slice(0, 2).reverse()

        const filter = {
          identifier: {
            in: [identifier]
          }
        }

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query grants($filter: GrantFilter) {
                grants(filter: $filter) {
                  edges {
                    node {
                      id
                      state
                    }
                    cursor
                  }
                }
              }
            `,
            variables: { filter }
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
          const grant = filteredGrants[idx]
          expect(edge.cursor).toEqual(grant.id)
          expect(edge.node).toEqual({
            __typename: 'Grant',
            id: grant.id,
            state: grant.state
          })
        })
      })

      test('state: in', async (): Promise<void> => {
        const grantPatches = [
          {
            state: GrantState.Pending
          },
          {
            state: GrantState.Processing
          },
          {
            state: GrantState.Finalized
          }
        ]
        for (const patch of grantPatches) {
          const grant = await createGrant(deps, tenant.id)
          await grant.$query().patch(patch)
        }

        const filter = {
          state: {
            in: [GrantState.Pending, GrantState.Processing]
          }
        }

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query grants($filter: GrantFilter) {
                grants(filter: $filter) {
                  edges {
                    node {
                      id
                      state
                    }
                    cursor
                  }
                }
              }
            `,
            variables: { filter }
          })
          .then((query): GrantsConnection => {
            if (query.data) {
              return query.data.grants
            } else {
              throw new Error('Data was empty')
            }
          })
        query.edges.forEach((edge) => {
          expect(filter.state.in).toContain(edge.node.state)
        })
        expect(query.edges).toHaveLength(
          grantPatches.filter((p) => filter.state.in.includes(p.state)).length
        )
      })

      test('state: notIn', async (): Promise<void> => {
        const grantPatches = [
          { state: GrantState.Pending },
          { state: GrantState.Pending },
          { state: GrantState.Approved }
        ]
        for (const patch of grantPatches) {
          const grant = await createGrant(deps, tenant.id)
          await grant.$query().patch(patch)
        }

        const filter = {
          state: {
            notIn: [GrantState.Pending]
          }
        }

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query grants($filter: GrantFilter) {
                grants(filter: $filter) {
                  edges {
                    node {
                      id
                      state
                    }
                    cursor
                  }
                }
              }
            `,
            variables: { filter }
          })
          .then((query): GrantsConnection => {
            if (query.data) {
              return query.data.grants
            } else {
              throw new Error('Data was empty')
            }
          })
        query.edges.forEach((edge) => {
          expect(filter.state.notIn).not.toContain(edge.node.state)
        })
        expect(query.edges).toHaveLength(
          grantPatches.filter((p) => !filter.state.notIn.includes(p.state))
            .length
        )
      })

      test('finalizationReason: in', async (): Promise<void> => {
        const grantPatches = [
          {
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Revoked
          },
          {
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Revoked
          },
          {
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Issued
          }
        ]
        for (const patch of grantPatches) {
          const grant = await createGrant(deps, tenant.id)
          await grant.$query().patch(patch)
        }

        const filter = {
          finalizationReason: {
            in: [GrantFinalization.Revoked]
          }
        }

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query grants($filter: GrantFilter) {
                grants(filter: $filter) {
                  edges {
                    node {
                      id
                      state
                      finalizationReason
                    }
                    cursor
                  }
                }
              }
            `,
            variables: { filter }
          })
          .then((query): GrantsConnection => {
            if (query.data) {
              return query.data.grants
            } else {
              throw new Error('Data was empty')
            }
          })
        query.edges.forEach((edge) => {
          expect(filter.finalizationReason.in).toContain(
            edge.node.finalizationReason
          )
        })
        expect(query.edges).toHaveLength(
          grantPatches.filter((p) =>
            filter.finalizationReason.in.includes(p.finalizationReason)
          ).length
        )
      })

      test('finalizationReason: notIn', async (): Promise<void> => {
        const grantPatches = [
          {
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Revoked
          },
          {
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Revoked
          },
          {
            state: GrantState.Finalized,
            finalizationReason: GrantFinalization.Issued
          }
        ]
        for (const patch of grantPatches) {
          const grant = await createGrant(deps, tenant.id)
          await grant.$query().patch(patch)
        }

        const filter = {
          finalizationReason: {
            notIn: [GrantFinalization.Revoked]
          }
        }

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query grants($filter: GrantFilter) {
                grants(filter: $filter) {
                  edges {
                    node {
                      id
                      state
                    }
                    cursor
                  }
                }
              }
            `,
            variables: { filter }
          })
          .then((query): GrantsConnection => {
            if (query.data) {
              return query.data.grants
            } else {
              throw new Error('Data was empty')
            }
          })
        query.edges.forEach((edge) => {
          expect(filter.finalizationReason.notIn).not.toContain(
            edge.node.finalizationReason
          )
        })
        expect(query.edges).toHaveLength(
          grantPatches.filter(
            (p) =>
              !filter.finalizationReason.notIn.includes(p.finalizationReason)
          ).length
        )
      })
    })
  })

  describe('Grant By id Queries', (): void => {
    let grant: GrantModel
    beforeEach(async (): Promise<void> => {
      grant = await createGrant(deps, tenant.id)
    })

    test('Can get a grant', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            query GetGrant($id: ID!) {
              grant(id: $id) {
                id
              }
            }
          `,
          variables: {
            id: grant?.id
          }
        })
        .then((query): Grant => {
          if (query.data) {
            return query.data.grant
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.id).toStrictEqual(grant.id)
    })

    test('Returns error for unknown grant', async (): Promise<void> => {
      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              query GetGrant($id: ID!) {
                grant(id: $id) {
                  id
                  client
                  state
                  access {
                    id
                    identifier
                    createdAt
                    actions
                    type
                  }
                  createdAt
                }
              }
            `,
            variables: {
              id: uuid()
            }
          })
          .then((query): Grant => {
            if (query.data) {
              return query.data.grant
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        assert.ok(error instanceof ApolloError)
        expect(error.message).toBe('No grant')
        expect(error.graphQLErrors[0].extensions?.code).toEqual(
          GraphQLErrorCode.NotFound
        )
      }
    })
  })

  describe('Revoke grant', (): void => {
    let grant: GrantModel
    beforeEach(async (): Promise<void> => {
      grant = await createGrant(deps, tenant.id)
    })

    test('Can revoke a grant', async (): Promise<void> => {
      const input: RevokeGrantInput = {
        grantId: grant.id
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeGrant($input: RevokeGrantInput!) {
              revokeGrant(input: $input) {
                id
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

      expect(response.id).toEqual(grant.id)
    })

    test('Returns error if grant id is not provided', async (): Promise<void> => {
      expect.assertions(2)
      try {
        const input: RevokeGrantInput = {
          grantId: ''
        }

        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation revokeGrant($input: RevokeGrantInput!) {
                revokeGrant(input: $input) {
                  id
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
      } catch (error) {
        assert.ok(error instanceof ApolloError)
        expect(error.message).toBe('Grant id is not provided')
        expect(error.graphQLErrors[0].extensions?.code).toEqual(
          GraphQLErrorCode.Forbidden
        )
      }
    })

    test('Returns error if id does not exist', async (): Promise<void> => {
      expect.assertions(2)
      try {
        const input: RevokeGrantInput = {
          grantId: uuid()
        }

        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation revokeGrant($input: RevokeGrantInput!) {
                revokeGrant(input: $input) {
                  id
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
      } catch (error) {
        assert.ok(error instanceof ApolloError)
        expect(error.message).toBe('Revoke grant was not successful')
        expect(error.graphQLErrors[0].extensions?.code).toEqual(
          GraphQLErrorCode.NotFound
        )
      }
    })

    test('Returns error if grant id is in invalid format', async (): Promise<void> => {
      expect.assertions(1)

      try {
        const input: RevokeGrantInput = {
          grantId: '123'
        }

        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation revokeGrant($input: RevokeGrantInput!) {
                revokeGrant(input: $input) {
                  id
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
      } catch (error) {
        assert.ok(error instanceof ApolloError)
        expect(error.graphQLErrors[0].extensions?.code).toEqual(
          GraphQLErrorCode.InternalServerError
        )
      }
    })
  })
})
