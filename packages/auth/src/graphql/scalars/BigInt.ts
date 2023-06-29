import {
  Kind,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
  GraphQLError
} from 'graphql'

declare global {
  interface BigInt {
    toJSON(): string
  }
}

function isBigIntAvailable() {
  return (
    (typeof global === 'object' && global.BigInt) ||
    (typeof window === 'object' && window.BigInt)
  )
}

function patchBigInt() {
  if (!BigInt.prototype.toJSON) {
    BigInt.prototype.toJSON =
      BigInt.prototype.toJSON ||
      function (this: bigint) {
        return this.toString()
      }
  }
}

function coerceBigIntValue(
  value: bigint | number | string | unknown
): bigint | number {
  if (
    typeof value !== 'bigint' &&
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    throw new TypeError('Input must be of type bigint, number, or string.')
  }
  if (isBigIntAvailable()) {
    patchBigInt()
    const uInt64 = BigInt(value)
    if (uInt64 < BigInt(0)) throw new TypeError('Input must be unsigned.')
    return uInt64
  } else {
    return Number(value)
  }
}

export const GraphQLBigIntConfig: GraphQLScalarTypeConfig<
  number | string | bigint,
  bigint | number
> = /*#__PURE__*/ {
  name: 'BigInt',
  description:
    'The `BigInt` scalar type represents non-fractional signed whole numeric values.',
  serialize: coerceBigIntValue,
  parseValue: coerceBigIntValue,
  parseLiteral(ast) {
    if (
      ast.kind === Kind.INT ||
      ast.kind === Kind.FLOAT ||
      ast.kind === Kind.STRING
    ) {
      return coerceBigIntValue(ast.value)
    }
    throw new GraphQLError('Provided value is not int, float, or string', {
      extensions: { code: 'BAD_USER_INPUT' }
    })
  }
}

export const GraphQLBigInt = /*#__PURE__*/ new GraphQLScalarType(
  GraphQLBigIntConfig
)
