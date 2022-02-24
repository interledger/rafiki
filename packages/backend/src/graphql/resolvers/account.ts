import { assetToGraphql } from './asset'
import {
  QueryResolvers,
  ResolversTypes,
  Account as SchemaAccount,
  MutationResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { Account } from '../../open_payments/account/model'

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
  return accountToGraphql(account)
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
      account: accountToGraphql(account)
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

export const triggerAccountEvents: MutationResolvers<ApolloContext>['triggerAccountEvents'] = async (
  parent,
  args,
  ctx
): ResolversTypes['TriggerAccountEventsMutationResponse'] => {
  try {
    const accountService = await ctx.container.use('accountService')
    const count = await accountService.triggerEvents(args.limit)
    return {
      code: '200',
      success: true,
      message: 'Triggered Account Events',
      count
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.limit,
        error
      },
      'error triggering account events'
    )
    return {
      code: '500',
      message: 'Error trying to trigger account events',
      success: false
    }
  }
}

export const accountToGraphql = (account: Account): SchemaAccount => ({
  id: account.id,
  asset: assetToGraphql(account.asset),
  createdAt: new Date(+account.createdAt).toISOString()
})
