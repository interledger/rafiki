import {
  ApolloClient,
  NormalizedCacheObject,
  ApolloQueryResult
} from '@apollo/client'
import { gql } from '@apollo/client'

import { Model, PageInfo } from '../generated/graphql'
import { BaseModel } from '../../shared/baseModel'

interface PageTestsOptions<Type> {
  getClient: () => ApolloClient<NormalizedCacheObject>
  createModel: () => Promise<Type>
  pagedQuery: string
  parent?: ParentModel
}

interface ParentModel {
  query: string
  getId: () => string
}

interface Connection<Type> {
  pageInfo: PageInfo
  edges: Edge<Type>[]
}

interface Edge<Type> {
  node: Type
  cursor: string
}

const queryFields = `edges {
    node {
      id
    }
    cursor
  }
  pageInfo {
    endCursor
    hasNextPage
    hasPreviousPage
    startCursor
  }`

export const getPageTests = <T extends Model, M extends BaseModel>({
  getClient,
  createModel,
  pagedQuery,
  parent
}: PageTestsOptions<M>): void => {
  const toConnection = (query: ApolloQueryResult<T>): Connection<T> => {
    if (query.data) {
      if (parent) {
        const parentData = query.data[parent.query as keyof typeof query.data]

        if (parentData) {
          return (parentData as Record<string, Connection<T>>)[pagedQuery]
        } else {
          throw new Error(`Parent ${parent.query} was empty`)
        }
      } else {
        return query.data[
          pagedQuery as keyof typeof query.data
        ] as Connection<T>
      }
    } else {
      throw new Error('Data was empty')
    }
  }

  describe('Common query resolver pagination', (): void => {
    let apolloClient: ApolloClient<NormalizedCacheObject>

    beforeAll((): void => {
      apolloClient = getClient()
    })

    async function createModels(): Promise<M[]> {
      const models: M[] = []
      for (let i = 0; i < 50; i++) {
        models[49 - i] = await createModel()
      }
      return models
    }

    test('pageInfo is correct on default query without params', async (): Promise<void> => {
      const models = await createModels()

      const query = await apolloClient
        .query({
          query: parent
            ? gql`
              query Page($id: String!) {
                ${parent.query}(id: $id) {
                  ${pagedQuery} {
                    ${queryFields}
                  }
                }
              }`
            : gql`
              query Page {
                ${pagedQuery} {
                  ${queryFields}
                }
              }
            `,
          variables: {
            id: parent?.getId()
          }
        })
        .then(toConnection)
      expect(query.edges).toHaveLength(20)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toEqual(models[0].id)
      expect(query.pageInfo.endCursor).toEqual(models[19].id)
    })

    test('No models, but models requested', async (): Promise<void> => {
      const query = await apolloClient
        .query({
          query: parent
            ? gql`
              query Page($id: String!) {
                ${parent.query}(id: $id) {
                  ${pagedQuery} {
                    ${queryFields}
                  }
                }
              }`
            : gql`
              query Page {
                ${pagedQuery} {
                  ${queryFields}
                }
              }
            `,
          variables: {
            id: parent?.getId()
          }
        })
        .then(toConnection)
      expect(query.edges).toHaveLength(0)
      expect(query.pageInfo.hasNextPage).toBeFalsy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toBeNull()
      expect(query.pageInfo.endCursor).toBeNull()
    })

    test('pageInfo is correct on pagination from start', async (): Promise<void> => {
      const models = await createModels()
      const query = await apolloClient
        .query({
          query: parent
            ? gql`
              query Page($id: String!) {
                ${parent.query}(id: $id) {
                  ${pagedQuery}(first: 10) {
                    ${queryFields}
                  }
                }
              }`
            : gql`
              query Page {
                ${pagedQuery}(first: 10) {
                  ${queryFields}
                }
              }
            `,
          variables: {
            id: parent?.getId()
          }
        })
        .then(toConnection)
      expect(query.edges).toHaveLength(10)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toEqual(models[0].id)
      expect(query.pageInfo.endCursor).toEqual(models[9].id)
    })

    test('pageInfo is correct on pagination from middle', async (): Promise<void> => {
      const models = await createModels()
      const query = await apolloClient
        .query({
          query: parent
            ? gql`
              query Page($id: String!, $after: String!) {
                ${parent.query}(id: $id) {
                  ${pagedQuery}(after: $after) {
                    ${queryFields}
                  }
                }
              }`
            : gql`
              query Page($after: String!) {
                ${pagedQuery}(after: $after) {
                  ${queryFields}
                }
              }
            `,
          variables: {
            id: parent?.getId(),
            after: models[19].id
          }
        })
        .then(toConnection)
      expect(query.edges).toHaveLength(20)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.pageInfo.startCursor).toEqual(models[20].id)
      expect(query.pageInfo.endCursor).toEqual(models[39].id)
    })

    test('pageInfo is correct on pagination near end', async (): Promise<void> => {
      const models = await createModels()
      const query = await apolloClient
        .query({
          query: parent
            ? gql`
              query Page($id: String!, $after: String!) {
                ${parent.query}(id: $id) {
                  ${pagedQuery}(after: $after, first: 10) {
                    ${queryFields}
                  }
                }
              }`
            : gql`
              query Page($after: String!) {
                ${pagedQuery}(after: $after, first: 10) {
                  ${queryFields}
                }
              }
            `,
          variables: {
            id: parent?.getId(),
            after: models[44].id
          }
        })
        .then(toConnection)
      expect(query.edges).toHaveLength(5)
      expect(query.pageInfo.hasNextPage).toBeFalsy()
      expect(query.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.pageInfo.startCursor).toEqual(models[45].id)
      expect(query.pageInfo.endCursor).toEqual(models[49].id)
    })
  })
}

test.todo('test suite must contain at least one test')
