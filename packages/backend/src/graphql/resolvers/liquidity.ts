import {
  ResolversTypes,
  MutationResolvers,
  LiquidityError as LiquidityErrorResp
} from '../generated/graphql'
import { LiquidityError } from '../../liquidity/errors'

export const addAccountLiquidity: MutationResolvers['addAccountLiquidity'] = async (
  parent,
  args,
  ctx
): ResolversTypes['AddAccountLiquidityMutationResponse'] => {
  try {
    const accountService = await ctx.container.use('accountService')
    const account = await accountService.get(args.input.accountId)
    if (!account) {
      return {
        code: '404',
        message: 'Unknown account',
        success: false,
        error: LiquidityErrorResp.UnknownAccount
      }
    }
    const liquidityService = await ctx.container.use('liquidityService')
    const error = await liquidityService.add({
      id: args.input.id,
      account,
      amount: args.input.amount
    })
    if (error) {
      return errorToResponse[error]
    }
    return {
      code: '200',
      success: true,
      message: 'Added account liquidity'
    }
  } catch (error) {
    ctx.logger.error(
      {
        input: args.input,
        error
      },
      'error adding account liquidity'
    )
    return {
      code: '400',
      message: 'Error trying to add account liquidity',
      success: false
    }
  }
}

export const addAssetLiquidity: MutationResolvers['addAssetLiquidity'] = async (
  parent,
  args,
  ctx
): ResolversTypes['AddAssetLiquidityMutationResponse'] => {
  try {
    const assetService = await ctx.container.use('assetService')
    const asset = await assetService.getById(args.input.assetId)
    if (!asset) {
      return {
        code: '404',
        message: 'Unknown asset',
        success: false,
        error: LiquidityErrorResp.UnknownAsset
      }
    }
    const liquidityService = await ctx.container.use('liquidityService')
    const error = await liquidityService.add({
      id: args.input.id,
      account: asset,
      amount: args.input.amount
    })
    if (error) {
      return errorToResponse[error]
    }
    return {
      code: '200',
      success: true,
      message: 'Added asset liquidity'
    }
  } catch (error) {
    ctx.logger.error(
      {
        input: args.input,
        error
      },
      'error adding asset liquidity'
    )
    return {
      code: '400',
      message: 'Error trying to add asset liquidity',
      success: false
    }
  }
}

export const createAccountLiquidityWithdrawal: MutationResolvers['createAccountLiquidityWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateAccountLiquidityWithdrawalMutationResponse'] => {
  try {
    const accountService = await ctx.container.use('accountService')
    const account = await accountService.get(args.input.accountId)
    if (!account) {
      return {
        code: '404',
        message: 'Unknown account',
        success: false,
        error: LiquidityErrorResp.UnknownAccount
      }
    }
    const liquidityService = await ctx.container.use('liquidityService')
    const error = await liquidityService.createWithdrawal({
      id: args.input.id,
      account,
      amount: args.input.amount
    })
    if (error) {
      return errorToResponse[error]
    }
    return {
      code: '200',
      success: true,
      message: 'Created account liquidity withdrawal'
    }
  } catch (error) {
    ctx.logger.error(
      {
        input: args.input,
        error
      },
      'error creating account liquidity withdrawal'
    )
    return {
      code: '400',
      message: 'Error trying to create account liquidity withdrawal',
      success: false
    }
  }
}

export const createAssetLiquidityWithdrawal: MutationResolvers['createAssetLiquidityWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateAssetLiquidityWithdrawalMutationResponse'] => {
  try {
    const assetService = await ctx.container.use('assetService')
    const asset = await assetService.getById(args.input.assetId)
    if (!asset) {
      return {
        code: '404',
        message: 'Unknown asset',
        success: false,
        error: LiquidityErrorResp.UnknownAsset
      }
    }
    const liquidityService = await ctx.container.use('liquidityService')
    const error = await liquidityService.createWithdrawal({
      id: args.input.id,
      account: asset,
      amount: args.input.amount
    })
    if (error) {
      return errorToResponse[error]
    }
    return {
      code: '200',
      success: true,
      message: 'Created asset liquidity withdrawal'
    }
  } catch (error) {
    ctx.logger.error(
      {
        input: args.input,
        error
      },
      'error creating asset liquidity withdrawal'
    )
    return {
      code: '400',
      message: 'Error trying to create asset liquidity withdrawal',
      success: false
    }
  }
}

export const finalizeLiquidityWithdrawal: MutationResolvers['finalizeLiquidityWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['FinalizeLiquidityWithdrawalMutationResponse'] => {
  const liquidityService = await ctx.container.use('liquidityService')
  const error = await liquidityService.finalizeWithdrawal(args.withdrawalId)
  if (error) {
    return errorToResponse[error]
  }
  return {
    code: '200',
    success: true,
    message: 'Finalized Withdrawal'
  }
}

export const rollbackLiquidityWithdrawal: MutationResolvers['rollbackLiquidityWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['RollbackLiquidityWithdrawalMutationResponse'] => {
  const liquidityService = await ctx.container.use('liquidityService')
  const error = await liquidityService.rollbackWithdrawal(args.withdrawalId)
  if (error) {
    return errorToResponse[error]
  }
  return {
    code: '200',
    success: true,
    message: 'Rolled Back Withdrawal'
  }
}

const errorToResponse: {
  [key in LiquidityError]: {
    code: string
    message: string
    success: boolean
    error: LiquidityErrorResp
  }
} = {
  [LiquidityError.AlreadyFinalized]: {
    code: '409',
    message: 'Withdrawal already finalized',
    success: false,
    error: LiquidityErrorResp.AlreadyFinalized
  },
  [LiquidityError.AlreadyRolledBack]: {
    code: '409',
    message: 'Withdrawal already rolled back',
    success: false,
    error: LiquidityErrorResp.AlreadyRolledBack
  },
  [LiquidityError.InsufficientBalance]: {
    code: '403',
    message: 'Insufficient balance',
    success: false,
    error: LiquidityErrorResp.InsufficientBalance
  },
  [LiquidityError.InvalidId]: {
    code: '400',
    message: 'Invalid id',
    success: false,
    error: LiquidityErrorResp.InvalidId
  },
  [LiquidityError.TransferExists]: {
    code: '409',
    message: 'Transfer exists',
    success: false,
    error: LiquidityErrorResp.TransferExists
  },
  [LiquidityError.UnknownWithdrawal]: {
    code: '404',
    message: 'Unknown withdrawal',
    success: false,
    error: LiquidityErrorResp.UnknownWithdrawal
  }
}
