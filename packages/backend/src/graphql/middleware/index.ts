import { GraphQLError } from 'graphql'
import { IMiddleware } from 'graphql-middleware'
import { ApolloContext } from '../../app'
import { CacheDataStore } from '../../cache/data-stores'
import { cacheMiddleware } from '../../cache/middleware'

export function idempotencyGraphQLMiddleware(dataStore: CacheDataStore): {
  Mutation: IMiddleware
} {
  return {
    Mutation: async (resolve, root, args, context: ApolloContext, info) => {
      return cacheMiddleware({
        deps: { logger: context.logger, dataStore },
        idempotencyKey: args?.input?.idempotencyKey,
        request: () => resolve(root, args, context, info),
        requestParams: args,
        operationName: '',
        handleParamMismatch: () => {
          throw new GraphQLError(
            `Incoming arguments are different than the original request(s) for idempotencyKey: ${args?.input?.idempotencyKey}`
          )
        }
      })
    }
  }
}
