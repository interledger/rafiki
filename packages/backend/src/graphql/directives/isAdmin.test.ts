import { ApolloServer } from 'apollo-server'
import { makeExecutableSchema } from 'graphql-tools'
import { isAdminDirectiveTransformer } from './isAdmin'
import {
  ApolloClient,
  NormalizedCacheObject,
  InMemoryCache,
  createHttpLink,
  gql
} from '@apollo/client'
import fetch from 'cross-fetch'

describe('isAdmin Directive', (): void => {
  let server: ApolloServer
  let client: ApolloClient<NormalizedCacheObject>

  beforeAll(async (): Promise<void> => {
    const schema = makeExecutableSchema({
      typeDefs: [
        `
        type Query {
          hello: QueryResponse @isAdmin
        }

        type QueryResponse {
          code: String!
          success: Boolean!
          message: String!
        }

        directive @isAdmin on OBJECT | FIELD_DEFINITION
      `
      ],
      resolvers: {
        Query: {
          hello: () => {
            return {
              code: '200',
              success: true,
              message: 'Hello World!'
            }
          }
        }
      }
    })

    const schemaWithDirectives = isAdminDirectiveTransformer(schema)

    server = new ApolloServer({
      schema: schemaWithDirectives,
      context: ({ req }): { admin: boolean } => {
        return {
          admin: req.headers['x-api-key'] == 'qwertyuiop1234567890'
        }
      }
    })
    await server.listen(3011)
    const httpLink = createHttpLink({
      uri: 'http://localhost:3011/graphql',
      fetch
    })
    client = new ApolloClient({
      link: httpLink,
      cache: new InMemoryCache(),
      defaultOptions: {
        query: {
          fetchPolicy: 'no-cache'
        }
      }
    })
  })

  afterAll(async (): Promise<void> => {
    await server.stop()
  })

  describe('isAdmin Directive Query', (): void => {
    test('should not succeed without admin API key', async (): Promise<void> => {
      const response = await client
        .query({
          query: gql`
            {
              hello {
                code
                success
                message
              }
            }
          `
        })
        .then((query) => {
          if (query.data) {
            return query.data.hello
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.success).toBe(false)
      expect(response.code).toEqual('401')
      expect(response.message).toEqual('Unauthorized.')
    })

    test('should succeed with admin API key', async (): Promise<void> => {
      const response = await client
        .query({
          query: gql`
            {
              hello {
                code
                success
                message
              }
            }
          `,
          context: {
            headers: {
              'x-api-key': 'qwertyuiop1234567890'
            }
          }
        })
        .then((query) => {
          if (query.data) {
            return query.data.hello
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.message).toEqual('Hello World!')
    })
  })
})
