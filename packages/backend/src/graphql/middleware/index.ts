import { GraphQLError } from 'graphql'
import { IMiddleware } from 'graphql-middleware'
import { ApolloContext, ForTenantIdContext } from '../../app'
import { CacheDataStore } from '../../middleware/cache/data-stores'
import { lockMiddleware, Lock } from '../../middleware/lock'
import { cacheMiddleware } from '../../middleware/cache'
import { validateTenantMiddleware } from '../../middleware/tenant'
import { GraphQLErrorCode } from '../errors'

export function lockGraphQLMutationMiddleware(lock: Lock): {
  Mutation: IMiddleware
} {
  return {
    Mutation: async (resolve, root, args, context: ApolloContext, info) => {
      return lockMiddleware({
        deps: { logger: context.logger, lock },
        next: () => resolve(root, args, context, info),
        key: args?.input?.idempotencyKey,
        onFailToAcquireLock: () => {
          throw new GraphQLError(
            `Concurrent request for idempotencyKey: ${args?.input?.idempotencyKey}`
          )
        }
      })
    }
  }
}

export function idempotencyGraphQLMiddleware(
  dataStore: CacheDataStore<string>
): {
  Mutation: IMiddleware
} {
  return {
    Mutation: async (resolve, root, args, context: ApolloContext, info) => {
      return cacheMiddleware({
        deps: { logger: context.logger, dataStore },
        idempotencyKey: args?.input?.idempotencyKey,
        request: () => resolve(root, args, context, info),
        requestParams: args,
        operationName: info.fieldName,
        handleParamMismatch: () => {
          throw new GraphQLError(
            `Incoming arguments are different than the original request for idempotencyKey: ${args?.input?.idempotencyKey}`
          )
        }
      })
    }
  }
}

export function setForTenantIdGraphQLMutationMiddleware(): {
  Mutation: IMiddleware<ForTenantIdContext>
} {
  return {
    Mutation: async (
      resolve,
      root,
      args,
      context: ForTenantIdContext,
      info
    ) => {
      return validateTenantMiddleware({
        deps: { context },
        next: () => resolve(root, args, context, info),
        tenantIdInput: args?.input?.tenantId,
        onFailValidation: () => {
          throw new GraphQLError(
            `Assignment to the specified tenant is not permitted`,
            {
              extensions: {
                code: GraphQLErrorCode.BadUserInput
              }
            }
          )
        }
      })
    }
  }
}
