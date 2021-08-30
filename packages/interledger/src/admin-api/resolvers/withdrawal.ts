import {
  QueryResolvers,
  ResolversTypes,
  MutationResolvers,
  WithdrawalsConnectionResolvers,
  WithdrawError as WithdrawErrorResp
} from '../generated/graphql'
import { WithdrawError, isWithdrawError } from '../../accounts/types'

export const getWithdrawal: QueryResolvers['withdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Withdrawal'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const createWithdrawal: MutationResolvers['createWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateWithdrawalMutationResponse'] => {
  const withdrawalOrError = await ctx.accountsService.createWithdrawal({
    id: args.input.id,
    accountId: args.input.ilpAccountId,
    amount: args.input.amount
  })
  if (isWithdrawError(withdrawalOrError)) {
    return errorToResponse[withdrawalOrError]
  }
  return {
    code: '200',
    success: true,
    message: 'Created Withdrawal',
    withdrawal: {
      id: withdrawalOrError.id,
      ilpAccountId: withdrawalOrError.accountId,
      amount: withdrawalOrError.amount
      // createdTime: withdrawalOrError.createdTime
    }
  }
}

export const finalizePendingWithdrawal: MutationResolvers['finalizePendingWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['FinalizePendingWithdrawalMutationResponse'] => {
  const error = await ctx.accountsService.finalizeWithdrawal(args.withdrawalId)
  if (error) {
    return errorToResponse[error]
  }
  return {
    code: '200',
    success: true,
    message: 'Finalized Withdrawal'
  }
}

export const rollbackPendingWithdrawal: MutationResolvers['rollbackPendingWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['RollbackPendingWithdrawalMutationResponse'] => {
  const error = await ctx.accountsService.rollbackWithdrawal(args.withdrawalId)
  if (error) {
    return errorToResponse[error]
  }
  return {
    code: '200',
    success: true,
    message: 'Rolled Back Withdrawal'
  }
}

export const getWithdrawalsConnectionPageInfo: WithdrawalsConnectionResolvers['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

const errorToResponse: {
  [key in WithdrawError]: {
    code: string
    message: string
    success: boolean
    error: WithdrawErrorResp
  }
} = {
  [WithdrawError.AlreadyFinalized]: {
    code: '409',
    message: 'Withdrawal already finalized',
    success: false,
    error: WithdrawErrorResp.AlreadyFinalized
  },
  [WithdrawError.AlreadyRolledBack]: {
    code: '409',
    message: 'Withdrawal already rolled back',
    success: false,
    error: WithdrawErrorResp.AlreadyRolledBack
  },
  [WithdrawError.InsufficientBalance]: {
    code: '403',
    message: 'Insufficient balance',
    success: false,
    error: WithdrawErrorResp.InsufficientBalance
  },
  [WithdrawError.InsufficientLiquidity]: {
    code: '403',
    message: 'Insufficient liquidity',
    success: false,
    error: WithdrawErrorResp.InsufficientLiquidity
  },
  [WithdrawError.InsufficientSettlementBalance]: {
    code: '403',
    message: 'Insufficient settlement balance',
    success: false,
    error: WithdrawErrorResp.InsufficientSettlementBalance
  },
  [WithdrawError.InvalidId]: {
    code: '400',
    message: 'Invalid id',
    success: false,
    error: WithdrawErrorResp.InvalidId
  },
  [WithdrawError.UnknownAccount]: {
    code: '404',
    message: 'Unknown ILP account',
    success: false,
    error: WithdrawErrorResp.UnknownAccount
  },
  [WithdrawError.UnknownLiquidityAccount]: {
    code: '404',
    message: 'Unknown liquidity account',
    success: false,
    error: WithdrawErrorResp.UnknownLiquidityAccount
  },
  [WithdrawError.UnknownSettlementAccount]: {
    code: '404',
    message: 'Unknown settlement account',
    success: false,
    error: WithdrawErrorResp.UnknownSettlementAccount
  },
  [WithdrawError.UnknownWithdrawal]: {
    code: '404',
    message: 'Unknown withdrawal',
    success: false,
    error: WithdrawErrorResp.UnknownWithdrawal
  },
  [WithdrawError.WithdrawalExists]: {
    code: '409',
    message: 'Withdrawal exists',
    success: false,
    error: WithdrawErrorResp.WithdrawalExists
  }
}
