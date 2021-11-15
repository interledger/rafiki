import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils'
import { GraphQLSchema, defaultFieldResolver } from 'graphql'
import { isSessionError } from '../../session/errors'

export function authDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  const typeDirectiveArgumentMaps: Record<string, any> = {}
  return mapSchema(schema, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
    [MapperKind.OBJECT_TYPE]: (type: any) => {
      const authDirective = getDirective(schema, type, 'auth')?.[0]
      if (authDirective) {
        typeDirectiveArgumentMaps[type.name] = authDirective
      }
      return undefined
    },
    [MapperKind.OBJECT_FIELD]: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
      fieldConfig: any,
      _fieldName: string,
      typeName: string
    ) => {
      const authDirective =
        getDirective(schema, fieldConfig, 'auth')?.[0] ??
        typeDirectiveArgumentMaps[typeName]
      if (authDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig
        fieldConfig.resolve = function (
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
            throw new Error('not authorized')
          }
          return resolve(parent, args, context, info)
        }
        return fieldConfig
      }
    }
  })
}
