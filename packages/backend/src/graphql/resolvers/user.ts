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
  const id = ctx.user
  const userService = await ctx.container.use('userService')
  const user = await userService.get(id)
  return {
    id: user.id
  }
}

export const getAccount: UserResolvers['account'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Account'] => {
  const id = ctx.user
  const userService = await ctx.container.use('userService')
  const user = await userService.get(id)
  return {
    id: user.accountId
  }
}

export const getBalance: AccountResolvers['balance'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Amount'] => {
  const id = ctx.user
  const userService = await ctx.container.use('userService')
  const accountService = await ctx.container.use('accountService')
  const user = await userService.get(id)
  const account = await accountService.get(user.accountId)
  return {
    amount: 300,
    currency: account.currency,
    scale: account.scale
  }
}
