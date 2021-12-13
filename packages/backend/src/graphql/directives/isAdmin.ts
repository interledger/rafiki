import { GraphQLSchema } from 'graphql'
import { directiveTransformer } from './transformer'

export function isAdminDirectiveTransformer(
  schema: GraphQLSchema
): GraphQLSchema {
  return directiveTransformer(schema, 'isAdmin', isAdminResolver)
}

function isAdminResolver(
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
    if (!context.admin) {
      return {
        code: '401',
        message: 'Unauthorized.',
        success: false
      }
    }
    return resolve(parent, args, context, info)
  }
}
