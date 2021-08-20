import {
  QueryResolvers,
  ResolversTypes,
  MutationResolvers,
  WithdrawalsConnectionResolvers
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
    switch (withdrawalOrError) {
      case WithdrawError.InsufficientBalance:
        return {
          code: '403',
          message: 'Insufficient balance',
          success: false
        }
      case WithdrawError.InvalidId:
        return {
          code: '400',
          message: 'Invalid id',
          success: false
        }
      case WithdrawError.UnknownAccount:
        return {
          code: '404',
          message: 'Unknown ILP account',
          success: false
        }
      case WithdrawError.WithdrawalExists:
        return {
          code: '409',
          message: 'Withdrawal exists',
          success: false
        }
      default:
        throw new Error(`WithdrawError: ${withdrawalOrError}`)
    }
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
    switch (error) {
      case WithdrawError.AlreadyFinalized:
        return {
          code: '409',
          message: 'Withdrawal already finalized',
          success: false
        }
      case WithdrawError.AlreadyRolledBack:
        return {
          code: '409',
          message: 'Withdrawal already rolled back',
          success: false
        }
      case WithdrawError.InvalidId:
        return {
          code: '400',
          message: 'Invalid id',
          success: false
        }
      case WithdrawError.UnknownWithdrawal:
        return {
          code: '404',
          message: 'Unknown withdrawal',
          success: false
        }
      default:
        throw new Error(`WithdrawError: ${error}`)
    }
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
    switch (error) {
      case WithdrawError.AlreadyFinalized:
        return {
          code: '409',
          message: 'Withdrawal already finalized',
          success: false
        }
      case WithdrawError.AlreadyRolledBack:
        return {
          code: '409',
          message: 'Withdrawal already rolled back',
          success: false
        }
      case WithdrawError.InvalidId:
        return {
          code: '400',
          message: 'Invalid id',
          success: false
        }
      case WithdrawError.UnknownWithdrawal:
        return {
          code: '404',
          message: 'Unknown withdrawal',
          success: false
        }
      default:
        throw new Error(`WithdrawError: ${error}`)
    }
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
