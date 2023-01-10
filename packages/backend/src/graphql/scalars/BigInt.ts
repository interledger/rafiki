import { Kind, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql'

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

function coerceBigIntValue(value: bigint | number | string): bigint | number {
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
    return ''
  }
}

export const GraphQLBigInt = /*#__PURE__*/ new GraphQLScalarType(
  GraphQLBigIntConfig
)
