import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils'
import { GraphQLSchema, defaultFieldResolver } from 'graphql'

export function directiveTransformer(
  schema: GraphQLSchema,
  directiveName: string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  customResolver: Function
): GraphQLSchema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  const typeDirectiveArgumentMaps: Record<string, any> = {}
  return mapSchema(schema, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
    [MapperKind.OBJECT_TYPE]: (type: any) => {
      const directive = getDirective(schema, type, directiveName)?.[0]
      if (directive) {
        typeDirectiveArgumentMaps[type.name] = directive
      }
      return undefined
    },
    [MapperKind.OBJECT_FIELD]: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
      fieldConfig: any,
      _fieldName: string,
      typeName: string
    ) => {
      const directive =
        getDirective(schema, fieldConfig, directiveName)?.[0] ??
        typeDirectiveArgumentMaps[typeName]
      if (directive) {
        const { resolve = defaultFieldResolver } = fieldConfig
        fieldConfig.resolve = customResolver(resolve)
        return fieldConfig
      }
    }
  })
}
