import { GraphQLScalarType, Kind } from 'graphql'
import { UserInputError } from 'apollo-server'

export const bigintScalar = new GraphQLScalarType({
  name: 'UInt64',
  description:
    'The `BigInt` scalar type represents non-fractional signed whole numeric values. BigInt can represent values between -(2^63) + 1 and 2^63 - 1.',
  parseValue(value) {
    if (value === '') {
      throw new UserInputError(
        'The value cannot be converted from BigInt because it is empty string'
      )
    }
    if (typeof value !== 'number' && typeof value !== 'bigint') {
      throw new UserInputError(
        `The value ${value} cannot be converted to a BigInt because it is not an integer`
      )
    }

    return BigInt(value)
  },
  serialize(value) {
    if (value === '') {
      throw new UserInputError(
        'The value cannot be converted from BigInt because it is empty string'
      )
    }
    try {
      return BigInt(value.toString()).toString()
    } catch {
      throw new UserInputError(
        `The value ${value} cannot be converted to a BigInt because it is not an integer`
      )
    }
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.INT) {
      return BigInt(ast.value)
    } else {
      throw new UserInputError(
        `BigInt cannot represent non-integer value: ${ast.toString()}`
      )
    }
  }
})
