import {
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLInputObjectType
} from 'graphql/type/definition'
import { GraphQLSchema, graphql } from 'graphql'
import { GraphQLBigInt } from './BigInt'

describe('BigInt', () => {
  const Query = new GraphQLObjectType({
    name: 'Query',
    fields: {
      inc: {
        type: new GraphQLNonNull(GraphQLBigInt),
        args: {
          num: { type: new GraphQLNonNull(GraphQLBigInt) }
        },
        resolve: (root, args) => args.num + BigInt(1)
      },
      emptyErr: {
        type: new GraphQLNonNull(GraphQLBigInt),
        resolve: () => ''
      },
      typeErr: {
        type: new GraphQLNonNull(GraphQLBigInt),
        resolve: () => 3.14
      }
    }
  })

  const Mutation = new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      inc: {
        type: new GraphQLNonNull(
          new GraphQLObjectType({
            name: 'IncPayload',
            fields: {
              result: { type: new GraphQLNonNull(GraphQLBigInt) }
            }
          })
        ),
        args: {
          input: {
            type: new GraphQLNonNull(
              new GraphQLInputObjectType({
                name: 'IncInput',
                fields: {
                  num: { type: new GraphQLNonNull(GraphQLBigInt) }
                }
              })
            )
          }
        },
        resolve: (root, args) => ({ result: args.input.num + BigInt(1) })
      }
    }
  })

  const schema = new GraphQLSchema({
    query: Query,
    mutation: Mutation
  })

  const validQuery = `{
        a: inc(num: 1)
        b: inc(num: 2147483646)
        c: inc(num: 2147483647)
        d: inc(num: 2147483648)
        e: inc(num: 439857257821345)
        f: inc(num: 9007199254740992)
      }`

  const invalidQuery2 = `{
        k: typeErr
        a: inc(num: -1)
      }`

  const validMutation = `mutation test(
        $input1: IncInput!,
        $input2: IncInput!,
        $input4: IncInput!
      ) {
        a: inc(input: $input1) { result }
        b: inc(input: $input2) { result }
        d: inc(input: $input4) { result }
      }`

  const validVariables = {
    input1: { num: 2147483646 },
    input2: { num: BigInt(9007199254740990) },
    input4: { num: '1' }
  }

  it('2', async () => {
    const { data, errors } = await graphql(schema, invalidQuery2)

    expect(errors).toHaveLength(2)
    expect(errors[0].message).toContain('is not an integer')
    expect(errors[1].message).toContain('Input must be unsigned')
    expect(data).toEqual(null)
  })
  it('3', async () => {
    const { data, errors } = await graphql(schema, validQuery)
    expect(errors).toEqual(undefined)
    expect(data).toEqual({
      a: BigInt(2),
      b: BigInt(2147483647),
      c: BigInt(2147483648),
      d: BigInt(2147483649),
      e: BigInt(439857257821346),
      f: BigInt(9007199254740993)
    })
  })
  it('4', async () => {
    const { data, errors } = await graphql(
      schema,
      validMutation,
      null,
      null,
      validVariables
    )
    expect(errors).toEqual(undefined)
    expect(data).toEqual({
      a: { result: BigInt(2147483647) },
      b: { result: BigInt(9007199254740991) },
      d: { result: BigInt(2) }
    })
  })
})
