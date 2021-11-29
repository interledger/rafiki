import {
  QueryResolvers,
  ResolversTypes,
  MutationResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'

export const getAccount: QueryResolvers<ApolloContext>['account'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Account'] => {
  const accountService = await ctx.container.use('accountService')
  const account = await accountService.get(args.id)
  if (!account) {
    throw new Error('No account')
  }
  return account
}

export const createAccount: MutationResolvers<ApolloContext>['createAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateAccountMutationResponse'] => {
  try {
    const accountService = await ctx.container.use('accountService')
    const account = await accountService.create(args.input)
    return {
      code: '200',
      success: true,
      message: 'Created Account',
      account
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.input,
        error
      },
      'error creating account'
    )
    return {
      code: '500',
      message: 'Error trying to create account',
      success: false
    }
  }
}
