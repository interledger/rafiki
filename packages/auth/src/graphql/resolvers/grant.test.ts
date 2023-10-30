import { ApolloError, gql } from '@apollo/client'
import { v4 as uuid } from 'uuid'

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
  RevokeGrantInput,
  RevokeGrantMutationResponse
} from '../generated/graphql'
import { Grant, Grant as GrantModel } from '../../grant/model'
import { getPageTests } from './page.test'
import { createGrant } from '../../tests/grant'

describe('Grant Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
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
      createModel: () => createGrant(deps) as Promise<GrantModel>,
      pagedQuery: 'grants'
    })

    test('Can get grants', async (): Promise<void> => {
      const grants: GrantModel[] = []

      for (let i = 0; i < 2; i++) {
        const grant = await createGrant(deps)
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
          const grant = await createGrant(deps, { identifier })
          grants.push(grant)
        }

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
          const grant = grants[idx]
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
          const grant = await createGrant(deps)
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
          const grant = await createGrant(deps)
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
          const grant = await createGrant(deps)
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
          const grant = await createGrant(deps)
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
      grant = await createGrant(deps)
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
      const gqlQuery = appContainer.apolloClient
        .mutate({
          mutation: gql`
            query GetGrant($id: String!) {
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

      await expect(gqlQuery).rejects.toThrow(ApolloError)
    })
  })

  describe('Revoke grant', (): void => {
    let grant: GrantModel
    beforeEach(async (): Promise<void> => {
      grant = await createGrant(deps)
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
                code
                success
                message
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
      expect(response.code).toBe('200')
    })

    test('Returns 401 if grant id is not provided', async (): Promise<void> => {
      const input: RevokeGrantInput = {
        grantId: ''
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeGrant($input: RevokeGrantInput!) {
              revokeGrant(input: $input) {
                code
                success
                message
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
      expect(response.code).toBe('401')
      expect(response.message).toBe('Grant Id is not provided')
    })

    test('Returns 404 if id does not exist', async (): Promise<void> => {
      const input: RevokeGrantInput = {
        grantId: uuid()
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeGrant($input: RevokeGrantInput!) {
              revokeGrant(input: $input) {
                code
                success
                message
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
      expect(response.message).toBe('Revoke grant was not successful')
    })

    test('Returns 500 if grant id is in invaild format', async (): Promise<void> => {
      const input: RevokeGrantInput = {
        grantId: '123'
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeGrant($input: RevokeGrantInput!) {
              revokeGrant(input: $input) {
                code
                success
                message
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
      expect(response.code).toBe('500')
      expect(response.message).toBe('Error trying to revoke grant')
    })
  })
})
