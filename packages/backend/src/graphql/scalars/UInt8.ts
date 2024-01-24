import {
  Kind,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
  GraphQLError
} from 'graphql'

function coerceUInt8Value(value: number | string | unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new TypeError('Provided value is not number or string.')
  }
  const nValue = Number(value)
  if (Number.isInteger(nValue) && nValue >= 0 && nValue <= 255) {
    return nValue
  }
  throw new GraphQLError('Provided value is not a UInt8.', {
    extensions: { code: 'BAD_USER_INPUT' }
  })
}

export const GraphQLUInt8Config: GraphQLScalarTypeConfig<
  number | string,
  number
> = /*#__PURE__*/ {
  name: 'UInt8',
  description:
    'The `UInt8` scalar type represents 8 bit unsigned whole numeric values.',
  serialize: coerceUInt8Value,
  parseValue: coerceUInt8Value,
  parseLiteral(ast) {
    if (ast.kind === Kind.INT || ast.kind === Kind.STRING) {
      return coerceUInt8Value(ast.value)
    }
    throw new GraphQLError('Provided value is not int or string.', {
      extensions: { code: 'BAD_USER_INPUT' }
    })
  }
}

export const GraphQLUInt8 = /*#__PURE__*/ new GraphQLScalarType(
  GraphQLUInt8Config
)
