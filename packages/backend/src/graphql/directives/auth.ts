import { GraphQLSchema } from 'graphql'
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
    if (!context.session) {
      return {
        code: '401',
        message: 'Session not found.',
        success: false
      }
    }
    return resolve(parent, args, context, info)
  }
}
