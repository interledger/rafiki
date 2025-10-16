import {
  ApolloClient,
  ApolloError,
  ApolloQueryResult,
  gql,
  NormalizedCacheObject
} from '@apollo/client'
import { v4 as uuid } from 'uuid'
import assert from 'assert'

import {
  createApolloClient,
  createTestApp,
  TestContainer
} from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config, IAppConfig } from '../../config/app'
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
import { generateTenant } from '../../tests/tenant'
import { Tenant } from '../../tenant/model'

const responseHandler = (query: ApolloQueryResult<Query>): GrantsConnection => {
  if (query.data) {
    return query.data.grants
  } else {
    throw new Error('Data was empty')
  }
}

describe('Grant Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let config: IAppConfig
  let appContainer: TestContainer
  let operatorApolloClient: ApolloClient<NormalizedCacheObject>

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    config = await deps.use('config')
    operatorApolloClient = await createApolloClient(
      appContainer.container,
      appContainer.app
    )
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    operatorApolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Grants Queries', (): void => {
    getPageTests({
      getClient: () => operatorApolloClient,
      createModel: () =>
        createGrant(deps, config.operatorTenantId) as Promise<GrantModel>,
      pagedQuery: 'grants'
    })

    test('Can get grants', async (): Promise<void> => {
      const grants: GrantModel[] = []

      for (let i = 0; i < 2; i++) {
        grants[1 - i] = await createGrant(deps, config.operatorTenantId)
      }

      const query = await operatorApolloClient
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
          const grant = await createGrant(deps, config.operatorTenantId, {
            identifier
          })
          grants.push(grant)
        }
      })

      afterEach(() => {
        grants = []
      })

      test('ASC', async (): Promise<void> => {
        const query = await operatorApolloClient
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
        const query = await operatorApolloClient
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
          const grant = await createGrant(deps, config.operatorTenantId, {
            identifier
          })
          grants.push(grant)
        }

        const filteredGrants = grants.slice(0, 2).reverse()

        const filter = {
          identifier: {
            in: [identifier]
          }
        }

        const query = await operatorApolloClient
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
          const grant = await createGrant(deps, config.operatorTenantId)
          await grant.$query().patch(patch)
        }

        const filter = {
          state: {
            in: [GrantState.Pending, GrantState.Processing]
          }
        }

        const query = await operatorApolloClient
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
          const grant = await createGrant(deps, config.operatorTenantId)
          await grant.$query().patch(patch)
        }

        const filter = {
          state: {
            notIn: [GrantState.Pending]
          }
        }

        const query = await operatorApolloClient
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
          const grant = await createGrant(deps, config.operatorTenantId)
          await grant.$query().patch(patch)
        }

        const filter = {
          finalizationReason: {
            in: [GrantFinalization.Revoked]
          }
        }

        const query = await operatorApolloClient
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
          const grant = await createGrant(deps, config.operatorTenantId)
          await grant.$query().patch(patch)
        }

        const filter = {
          finalizationReason: {
            notIn: [GrantFinalization.Revoked]
          }
        }

        const query = await operatorApolloClient
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

    describe('Tenant boundaries', (): void => {
      test('Operator can view grants across all tenants', async (): Promise<void> => {
        const tenant = await Tenant.query().insertAndFetch(generateTenant())
        const secondTenant =
          await Tenant.query().insertAndFetch(generateTenant())

        await Promise.all([
          createGrant(deps, config.operatorTenantId),
          createGrant(deps, tenant.id),
          createGrant(deps, tenant.id),
          createGrant(deps, secondTenant.id)
        ])

        const query = await operatorApolloClient
          .query({
            query: gql`
              query grants($tenantId: ID) {
                grants(tenantId: $tenantId) {
                  edges {
                    node {
                      id
                      state
                      tenantId
                    }
                    cursor
                  }
                }
              }
            `,
            variables: {}
          })
          .then((query): GrantsConnection => {
            if (query.data) {
              return query.data.grants
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(query.edges).toHaveLength(4)
      })

      test('Operator can filter grants by tenantId', async (): Promise<void> => {
        const tenant = await Tenant.query().insertAndFetch(generateTenant())
        const secondTenant =
          await Tenant.query().insertAndFetch(generateTenant())

        await Promise.all([
          createGrant(deps, config.operatorTenantId),
          createGrant(deps, tenant.id),
          createGrant(deps, tenant.id),
          createGrant(deps, secondTenant.id)
        ])

        const query = await operatorApolloClient
          .query({
            query: gql`
              query grants($tenantId: ID) {
                grants(tenantId: $tenantId) {
                  edges {
                    node {
                      id
                      state
                      tenantId
                    }
                    cursor
                  }
                }
              }
            `,
            variables: { tenantId: tenant.id }
          })
          .then((query): GrantsConnection => {
            if (query.data) {
              return query.data.grants
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(query.edges).toHaveLength(2)
        expect(
          query.edges.every((edge) => edge.node.tenantId === tenant.id)
        ).toBeTruthy()
      })

      test("Tenant cannot view other tenant's grants", async (): Promise<void> => {
        const tenant = await Tenant.query().insertAndFetch(generateTenant())
        const secondTenant =
          await Tenant.query().insertAndFetch(generateTenant())

        await createGrant(deps, tenant.id)
        await createGrant(deps, tenant.id)
        await createGrant(deps, secondTenant.id)

        const tenantedApolloClient = await createApolloClient(
          appContainer.container,
          appContainer.app,
          tenant.id
        )

        const query = await tenantedApolloClient
          .query({
            query: gql`
              query grants($tenantId: ID) {
                grants(tenantId: $tenantId) {
                  edges {
                    node {
                      id
                      state
                      tenantId
                    }
                    cursor
                  }
                }
              }
            `,
            variables: { tenantId: tenant.id }
          })
          .then((query): GrantsConnection => {
            if (query.data) {
              return query.data.grants
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(query.edges).toHaveLength(2)
        expect(
          query.edges.every((edge) => edge.node.tenantId === tenant.id)
        ).toBeTruthy()
        tenantedApolloClient.stop()
      })
    })
  })

  describe('Grant By id Queries', (): void => {
    let grant: GrantModel
    beforeEach(async (): Promise<void> => {
      grant = await createGrant(deps, config.operatorTenantId)
    })

    test('Can get a grant', async (): Promise<void> => {
      const response = await operatorApolloClient
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
        await operatorApolloClient
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

    describe('Tenant boundaries', (): void => {
      test("Operator can get tenant's grant", async (): Promise<void> => {
        const tenant = await Tenant.query().insertAndFetch(generateTenant())
        const tenantGrant = await createGrant(deps, tenant.id)

        const response = await operatorApolloClient
          .mutate({
            mutation: gql`
              query GetGrant($id: ID!) {
                grant(id: $id) {
                  id
                }
              }
            `,
            variables: {
              id: tenantGrant.id
            }
          })
          .then((query): Grant => {
            if (query.data) {
              return query.data.grant
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(response.id).toStrictEqual(tenantGrant.id)
      })

      test("Tenant cannot get other tenant's grant", async (): Promise<void> => {
        const tenant = await Tenant.query().insertAndFetch(generateTenant())
        const secondTenant =
          await Tenant.query().insertAndFetch(generateTenant())

        const grantForSecondTenant = await createGrant(deps, secondTenant.id)

        const tenantedApolloClient = await createApolloClient(
          appContainer.container,
          appContainer.app,
          tenant.id
        )

        expect.assertions(2)
        try {
          await tenantedApolloClient
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
                id: grantForSecondTenant.id
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

        tenantedApolloClient.stop()
      })
    })
  })

  describe('Revoke grant', (): void => {
    let grant: GrantModel
    beforeEach(async (): Promise<void> => {
      grant = await createGrant(deps, config.operatorTenantId)
    })

    test('Can revoke a grant', async (): Promise<void> => {
      const input: RevokeGrantInput = {
        grantId: grant.id
      }

      const response = await operatorApolloClient
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

        await operatorApolloClient
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

        await operatorApolloClient
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

        await operatorApolloClient
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

    describe('Tenant boundaries', (): void => {
      test('Operator can revoke tenants grant', async (): Promise<void> => {
        const tenant = await Tenant.query().insertAndFetch(generateTenant())
        const tenantGrant = await createGrant(deps, tenant.id)
        const input: RevokeGrantInput = {
          grantId: tenantGrant.id
        }

        const response = await operatorApolloClient
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

        expect(response.id).toEqual(tenantGrant.id)
      })

      test('Tenant can revoke own grant', async (): Promise<void> => {
        const tenant = await Tenant.query().insertAndFetch(generateTenant())
        const tenantGrant = await createGrant(deps, tenant.id)
        const tenantedApolloClient = await createApolloClient(
          appContainer.container,
          appContainer.app,
          tenant.id
        )

        const input: RevokeGrantInput = {
          grantId: tenantGrant.id
        }

        const response = await tenantedApolloClient
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

        expect(response.id).toEqual(tenantGrant.id)
        tenantedApolloClient.stop()
      })

      test("Tenant cannot revoke other tenant's grant", async (): Promise<void> => {
        const tenant = await Tenant.query().insertAndFetch(generateTenant())
        const secondTenant =
          await Tenant.query().insertAndFetch(generateTenant())

        const tenantedApolloClient = await createApolloClient(
          appContainer.container,
          appContainer.app,
          tenant.id
        )

        try {
          const input: RevokeGrantInput = {
            grantId: (await createGrant(deps, secondTenant.id)).id
          }

          await tenantedApolloClient
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
            GraphQLErrorCode.NotFound
          )
        }
        tenantedApolloClient.stop()
      })
    })
  })
})
