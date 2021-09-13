import {
  QueryResolvers,
  ResolversTypes,
  MutationResolvers,
  WithdrawalsConnectionResolvers,
  WithdrawalError as WithdrawErrorResp
} from '../generated/graphql'
import { WithdrawalError, isWithdrawalError } from '../../withdrawal/service'

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
  const withdrawalOrError = await ctx.withdrawalService.create({
    id: args.input.id,
    accountId: args.input.ilpAccountId,
    amount: args.input.amount
  })
  if (isWithdrawalError(withdrawalOrError)) {
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
  const error = await ctx.withdrawalService.finalize(args.withdrawalId)
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
  const error = await ctx.withdrawalService.rollback(args.withdrawalId)
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
  [key in WithdrawalError]: {
    code: string
    message: string
    success: boolean
    error: WithdrawErrorResp
  }
} = {
  [WithdrawalError.AlreadyFinalized]: {
    code: '409',
    message: 'Withdrawal already finalized',
    success: false,
    error: WithdrawErrorResp.AlreadyFinalized
  },
  [WithdrawalError.AlreadyRolledBack]: {
    code: '409',
    message: 'Withdrawal already rolled back',
    success: false,
    error: WithdrawErrorResp.AlreadyRolledBack
  },
  [WithdrawalError.InsufficientBalance]: {
    code: '403',
    message: 'Insufficient balance',
    success: false,
    error: WithdrawErrorResp.InsufficientBalance
  },
  [WithdrawalError.InsufficientLiquidity]: {
    code: '403',
    message: 'Insufficient liquidity',
    success: false,
    error: WithdrawErrorResp.InsufficientLiquidity
  },
  [WithdrawalError.InsufficientSettlementBalance]: {
    code: '403',
    message: 'Insufficient settlement balance',
    success: false,
    error: WithdrawErrorResp.InsufficientSettlementBalance
  },
  [WithdrawalError.InvalidId]: {
    code: '400',
    message: 'Invalid id',
    success: false,
    error: WithdrawErrorResp.InvalidId
  },
  [WithdrawalError.UnknownAccount]: {
    code: '404',
    message: 'Unknown ILP account',
    success: false,
    error: WithdrawErrorResp.UnknownAccount
  },
  [WithdrawalError.UnknownAsset]: {
    code: '404',
    message: 'Unknown asset',
    success: false,
    error: WithdrawErrorResp.UnknownAsset
  },
  [WithdrawalError.UnknownWithdrawal]: {
    code: '404',
    message: 'Unknown withdrawal',
    success: false,
    error: WithdrawErrorResp.UnknownWithdrawal
  },
  [WithdrawalError.WithdrawalExists]: {
    code: '409',
    message: 'Withdrawal exists',
    success: false,
    error: WithdrawErrorResp.WithdrawalExists
  }
}
