import {
  QueryResolvers,
  ResolversTypes,
  AccountResolvers
} from '../generated/graphql'

export const getAccount: QueryResolvers['account'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Account'] => {
  const accountService = await ctx.container.use('accountService')

  const account = await accountService.get(args.id)

  return {
    id: account.id
  }
}

export const getBalance: AccountResolvers['balance'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Amount'] => {
  const accountService = await ctx.container.use('accountService')
  const account = await accountService.get(parent.id)
  // TODO: implement amount when we figure out how amounts are stored.
  return {
    amount: 300,
    currency: account.currency,
    scale: account.scale
  }
}
