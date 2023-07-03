import {
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLInputObjectType
} from 'graphql/type/definition'
import { GraphQLSchema, graphql } from 'graphql'
import { GraphQLUInt8 } from './UInt8'

describe('UInt8', () => {
  const Query = new GraphQLObjectType({
    name: 'Query',
    fields: {
      mirror: {
        type: new GraphQLNonNull(GraphQLUInt8),
        args: {
          num: { type: new GraphQLNonNull(GraphQLUInt8) }
        },
        resolve: (root, args) => args.num
      },
      typeBoolErr: {
        type: new GraphQLNonNull(GraphQLUInt8),
        resolve: () => true
      },
      typeFloatErr: {
        type: new GraphQLNonNull(GraphQLUInt8),
        resolve: () => 3.14
      }
    }
  })

  const Mutation = new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      mirror: {
        type: new GraphQLNonNull(
          new GraphQLObjectType({
            name: 'MirrorPayload',
            fields: {
              result: { type: new GraphQLNonNull(GraphQLUInt8) }
            }
          })
        ),
        args: {
          input: {
            type: new GraphQLNonNull(
              new GraphQLInputObjectType({
                name: 'MirrorInput',
                fields: {
                  num: { type: new GraphQLNonNull(GraphQLUInt8) }
                }
              })
            )
          }
        },
        resolve: (root, args) => ({ result: args.input.num })
      }
    }
  })

  const schema = new GraphQLSchema({
    query: Query,
    mutation: Mutation
  })

  it.each`
    query                      | description
    ${`{a: mirror(num: -1)}`}  | ${'is negative'}
    ${`{a: mirror(num: 256)}`} | ${'is larger than 255'}
  `('fails because num $description', async ({ query }) => {
    const { data, errors } = await graphql({ schema, source: query })

    expect(errors).toHaveLength(1)
    expect(errors).toBeDefined()
    const message = typeof errors !== 'undefined' ? errors[0]?.message : ''
    expect(message).toEqual('Provided value is not a UInt8.')
    expect(data).toBeUndefined()
  })
  it('fails because input is float', async () => {
    const floatQuery = `{
      k: typeFloatErr
    }`
    const { data, errors } = await graphql({ schema, source: floatQuery })

    expect(errors).toHaveLength(1)
    expect(errors).toBeDefined()
    const message = typeof errors !== 'undefined' ? errors[0]?.message : ''
    expect(message).toEqual('Provided value is not a UInt8.')
    expect(data).toBeNull()
  })
  it('fails because input is bool', async () => {
    const boolQuery = `{
        k: typeBoolErr
      }`
    const { data, errors } = await graphql({ schema, source: boolQuery })

    expect(errors).toHaveLength(1)
    expect(errors).toBeDefined()
    const message = typeof errors !== 'undefined' ? errors[0]?.message : ''
    expect(message).toEqual('Provided value is not number or string.')
    expect(data).toBeNull()
  })
  it('query success', async () => {
    const validQuery = `{
      a: mirror(num: 0)
      b: mirror(num: 1)
      c: mirror(num: 11)
      d: mirror(num: 111)
      e: mirror(num: 255)
    }`
    const { data, errors } = await graphql({ schema, source: validQuery })
    expect(errors).toEqual(undefined)
    expect(data).toEqual({
      a: 0,
      b: 1,
      c: 11,
      d: 111,
      e: 255
    })
  })
  it('mutation success', async () => {
    const validMutation = `mutation test(
      $input1: MirrorInput!,
      $input2: MirrorInput!,
      $input4: MirrorInput!
    ) {
      a: mirror(input: $input1) { result }
      b: mirror(input: $input2) { result }
      d: mirror(input: $input4) { result }
    }`
    const validVariables = {
      input1: { num: 5 },
      input2: { num: '' },
      input4: { num: '1' }
    }
    const { data, errors } = await graphql({
      schema,
      source: validMutation,
      rootValue: null,
      contextValue: null,
      variableValues: validVariables
    })
    expect(errors).toEqual(undefined)
    expect(data).toEqual({
      a: { result: 5 },
      b: { result: 0 },
      d: { result: 1 }
    })
  })
})
