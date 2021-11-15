import { GraphQLSchema } from 'graphql'
import { isSessionError, SessionError } from '../../session/errors'
import { directiveTransformer } from './transformer'

export function authDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
  return directiveTransformer(schema, 'auth', authResolver)
}

function authResolver(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  resolve: any
) {
  return function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
    parent: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
    args: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
    context: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
    info: any
  ) {
    if (isSessionError(context.sessionOrError)) {
      switch (context.sessionOrError) {
        case SessionError.UnknownSession:
          return {
            code: '401',
            message: 'Session not found.',
            success: false
          }
        case SessionError.SessionExpired:
          return {
            code: '401',
            message: 'Session expired.',
            success: false
          }
      }
    }
    return resolve(parent, args, context, info)
  }
}
