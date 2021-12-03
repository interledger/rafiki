import { ApolloServer } from 'apollo-server'
import { makeExecutableSchema } from 'graphql-tools'
import { authDirectiveTransformer } from './auth'
import {
  ApolloClient,
  NormalizedCacheObject,
  InMemoryCache,
  createHttpLink,
  gql
} from '@apollo/client'
import fetch from 'cross-fetch'
import { Session } from '../../session/util'

describe('auth Directive', (): void => {
  let server: ApolloServer
  let client: ApolloClient<NormalizedCacheObject>

  beforeAll(
    async (): Promise<void> => {
      const schema = makeExecutableSchema({
        typeDefs: [
          `
        type Query {
          hello: QueryResponse @auth
        }

        type QueryResponse {
          code: String!
          success: Boolean!
          message: String!
        }

        directive @auth on OBJECT | FIELD_DEFINITION
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

      const schemaWithDirectives = authDirectiveTransformer(schema)

      server = new ApolloServer({
        schema: schemaWithDirectives,
        context: ({ req }): { session: Session | undefined } => {
          const key = req.headers['authorization']
          switch (key) {
            case 'validKey':
              return {
                session: {
                  expiresAt: new Date(Date.now() + 30 * 60 * 1000)
                }
              }
          }
          return { session: undefined }
        }
      })
      await server.listen(3010)
      const httpLink = createHttpLink({
        uri: 'http://localhost:3010/graphql',
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
    }
  )

  afterAll(
    async (): Promise<void> => {
      await server.stop()
    }
  )

  describe('Auth Directive Query', (): void => {
    test('should not succeed without session key', async (): Promise<void> => {
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
      expect(response.message).toEqual('Session not found.')
    })

    test('should not succeed with invalid session key', async (): Promise<void> => {
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
              authorization: 'invalidKey'
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
      expect(response.success).toBe(false)
      expect(response.code).toEqual('401')
      expect(response.message).toEqual('Session not found.')
    })

    test('should succeed with valid session key', async (): Promise<void> => {
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
              authorization: 'validKey'
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

    test('should not succeed with expired session key', async (): Promise<void> => {
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
              authorization: 'expiredKey'
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
      expect(response.success).toBe(false)
      expect(response.code).toEqual('401')
      expect(response.message).toEqual('Session not found.')
    })
  })
})
