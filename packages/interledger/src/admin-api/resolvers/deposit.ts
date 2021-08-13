import {
  QueryResolvers,
  ResolversTypes,
  MutationResolvers,
  DepositsConnectionResolvers
} from '../generated/graphql'
import { isDepositError } from '../../accounts/types'

export const getDeposit: QueryResolvers['deposit'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Deposit'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const createDeposit: MutationResolvers['createDeposit'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateDepositMutationResponse'] => {
  const depositOrError = await ctx.accountsService.deposit({
    id: args.input.id,
    accountId: args.input.ilpAccountId,
    amount: BigInt(args.input.amount)
  })
  if (isDepositError(depositOrError)) {
    return {
      code: '400',
      message: 'Failed to create deposit',
      success: false
    }
  }
  return {
    code: '200',
    success: true,
    message: 'Created Deposit',
    deposit: {
      id: depositOrError.id,
      ilpAccountId: depositOrError.accountId,
      amount: depositOrError.amount
      // createdTime: depositOrError.createdTime
    }
  }
}

export const getDepositsConnectionPageInfo: DepositsConnectionResolvers['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}
