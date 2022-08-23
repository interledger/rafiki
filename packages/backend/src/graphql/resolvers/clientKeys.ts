import {
  ResolversTypes,
  Client as SchemaClient,
  MutationResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { Client } from '../../clients/model'

export const createClient: MutationResolvers<ApolloContext>['createClient'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreateClientMutationResponse']> => {
    try {
      const clientService = await ctx.container.use('clientService')
      const client = await clientService.createClient(args.input)
      return {
        code: '200',
        success: true,
        message: 'Created Client',
        client: clientToGraphql(client)
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input,
          error
        },
        'error creating client'
      )
      return {
        code: '500',
        message: 'Error trying to create client',
        success: false
      }
    }
  }

export const addKeyToClient: MutationResolvers<ApolloContext>['addKeyToClient'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['AddKeyToClientMutationResponse']> => {
    try {
      const clientService = await ctx.container.use('clientService')
      const client = await clientService.addKeyToClient({
        ...args.input,
        jwk: JSON.parse(args.input.jwk)
      })
      return {
        code: '200',
        success: true,
        message: 'Added Key To Client',
        client: clientToGraphql(client)
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input,
          error
        },
        'error adding key to client'
      )
      return {
        code: '500',
        message: 'Error trying to add key to client',
        success: false
      }
    }
  }

export const clientToGraphql = (client: Client): SchemaClient => ({
  id: client.id,
  name: client.name,
  uri: client.name,
  email: client.email,
  image: client.image,
  keys:
    client.keys != null
      ? client.keys.map((key) => ({
          id: key.id,
          clientId: key.clientId,
          jwk: JSON.stringify(key.jwk),
          createdAt: new Date(+client.createdAt).toISOString()
        }))
      : [],
  createdAt: new Date(+client.createdAt).toISOString()
})
