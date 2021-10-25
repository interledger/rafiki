import { AccountHolderResolvers, ResolversTypes } from '../generated/graphql'
import { ApolloContext } from '../../app'

export const getAccount: AccountHolderResolvers<ApolloContext>['account'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Account'] => {
  if (!parent.id) throw new Error('missing id')
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  const payment = await outgoingPaymentService.get(parent.id)
  if (!payment) throw new Error('payment does not exist')
  const accountService = await ctx.container.use('accountService')
  const account = await accountService.get(payment.accountId)
  if (!account) {
    throw new Error('No account')
  }
  return account
}
