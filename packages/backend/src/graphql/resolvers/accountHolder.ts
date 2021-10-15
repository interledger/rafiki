import { AccountHolderResolvers, ResolversTypes } from '../generated/graphql'
import { ApolloContext } from '../../app'

export const getAccount: AccountHolderResolvers<ApolloContext>['account'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Account'] => {
  if (!parent.accountId) throw new Error('missing account id')
  const accountService = await ctx.container.use('accountService')
  const account = await accountService.get(parent.accountId)
  if (!account) {
    throw new Error('No account')
  }
  return account
}
