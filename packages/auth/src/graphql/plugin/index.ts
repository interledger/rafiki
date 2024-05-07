import {
  ApolloServerPlugin,
  GraphQLRequestContextDidEncounterErrors,
  GraphQLRequestContextDidResolveOperation,
  GraphQLRequestListener
} from '@apollo/server'
import { Logger } from 'pino'
import { v4 as uuid } from 'uuid'

import { GraphQLErrorCode } from '../errors'

export class LoggingPlugin implements ApolloServerPlugin {
  private logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  async requestDidStart(): Promise<GraphQLRequestListener<never>> {
    const requestId = uuid()
    const logger = this.logger
    let operation: string | null

    return {
      async didResolveOperation(
        context: GraphQLRequestContextDidResolveOperation<never>
      ) {
        operation = context.operationName
        logger.info({
          requestId,
          operation
        })
      },
      async didEncounterErrors(
        context: GraphQLRequestContextDidEncounterErrors<never>
      ): Promise<void> {
        if (context.errors) {
          context.errors.forEach((error) => {
            if (
              Object.keys(error.extensions).length === 0 ||
              error.extensions.code === GraphQLErrorCode.InternalServerError
            ) {
              logger.error({
                requestId,
                variables: context.request.variables,
                error
              })
            } else {
              logger.info({
                requestId,
                variables: context.request.variables,
                error
              })
            }
          })
        }
      }
    }
  }
}
