import {
  QueryResolvers,
  ResolversTypes,
  AccountResolvers,
  UserResolvers
} from '../generated/graphql'

export const getUser: QueryResolvers['user'] = async (
  parent,
  args,
  ctx
): ResolversTypes['User'] => {
  const userService = await ctx.container.use('userService')
  const user = await userService.get(args.userId)
  return {
    id: user.id
  }
}

export const getAccount: UserResolvers['account'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Account'] => {
  const userService = await ctx.container.use('userService')
  const user = await userService.get(parent.id)
  return {
    id: user.accountId
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
