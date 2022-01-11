import {
  ResolversTypes,
  MutationResolvers,
  LiquidityError,
  LiquidityMutationResponse,
  AccountWithdrawalMutationResponse,
  InvoiceWithdrawalMutationResponse
} from '../generated/graphql'
import { TransferError } from '../../accounting/errors'
import { ApolloContext } from '../../app'

export const addPeerLiquidity: MutationResolvers<ApolloContext>['addPeerLiquidity'] = async (
  parent,
  args,
  ctx
): ResolversTypes['LiquidityMutationResponse'] => {
  try {
    if (args.input.amount === BigInt(0)) {
      return responses[LiquidityError.AmountZero]
    }
    const peerService = await ctx.container.use('peerService')
    const peer = await peerService.get(args.input.peerId)
    if (!peer) {
      return responses[LiquidityError.UnknownPeer]
    }
    const accountingService = await ctx.container.use('accountingService')
    const error = await accountingService.createDeposit({
      id: args.input.id,
      accountId: peer.id,
      amount: args.input.amount
    })
    if (error) {
      return errorToResponse(error)
    }
    return {
      code: '200',
      success: true,
      message: 'Added peer liquidity'
    }
  } catch (error) {
    ctx.logger.error(
      {
        input: args.input,
        error
      },
      'error adding peer liquidity'
    )
    return {
      code: '400',
      message: 'Error trying to add peer liquidity',
      success: false
    }
  }
}

export const addAssetLiquidity: MutationResolvers<ApolloContext>['addAssetLiquidity'] = async (
  parent,
  args,
  ctx
): ResolversTypes['LiquidityMutationResponse'] => {
  try {
    if (args.input.amount === BigInt(0)) {
      return responses[LiquidityError.AmountZero]
    }
    const assetService = await ctx.container.use('assetService')
    const asset = await assetService.getById(args.input.assetId)
    if (!asset) {
      return responses[LiquidityError.UnknownAsset]
    }
    const accountingService = await ctx.container.use('accountingService')
    const error = await accountingService.createDeposit({
      id: args.input.id,
      asset: {
        unit: asset.unit
      },
      amount: args.input.amount
    })
    if (error) {
      return errorToResponse(error)
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

export const createPeerLiquidityWithdrawal: MutationResolvers<ApolloContext>['createPeerLiquidityWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['LiquidityMutationResponse'] => {
  try {
    if (args.input.amount === BigInt(0)) {
      return responses[LiquidityError.AmountZero]
    }
    const peerService = await ctx.container.use('peerService')
    const peer = await peerService.get(args.input.peerId)
    if (!peer) {
      return responses[LiquidityError.UnknownPeer]
    }
    const accountingService = await ctx.container.use('accountingService')
    const error = await accountingService.createWithdrawal({
      id: args.input.id,
      accountId: peer.id,
      amount: args.input.amount,
      timeout: BigInt(60e9) // 1 minute
    })
    if (error) {
      return errorToResponse(error)
    }
    return {
      code: '200',
      success: true,
      message: 'Created peer liquidity withdrawal'
    }
  } catch (error) {
    ctx.logger.error(
      {
        input: args.input,
        error
      },
      'error creating peer liquidity withdrawal'
    )
    return {
      code: '400',
      message: 'Error trying to create peer liquidity withdrawal',
      success: false
    }
  }
}

export const createAssetLiquidityWithdrawal: MutationResolvers<ApolloContext>['createAssetLiquidityWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['LiquidityMutationResponse'] => {
  try {
    if (args.input.amount === BigInt(0)) {
      return responses[LiquidityError.AmountZero]
    }
    const assetService = await ctx.container.use('assetService')
    const asset = await assetService.getById(args.input.assetId)
    if (!asset) {
      return responses[LiquidityError.UnknownAsset]
    }
    const accountingService = await ctx.container.use('accountingService')
    const error = await accountingService.createWithdrawal({
      id: args.input.id,
      asset: {
        unit: asset.unit
      },
      amount: args.input.amount,
      timeout: BigInt(60e9) // 1 minute
    })
    if (error) {
      return errorToResponse(error)
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

export const createAccountWithdrawal: MutationResolvers<ApolloContext>['createAccountWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['AccountWithdrawalMutationResponse'] => {
  try {
    const accountService = await ctx.container.use('accountService')
    const account = await accountService.get(args.input.accountId)
    if (!account) {
      return responses[
        LiquidityError.UnknownAccount
      ] as AccountWithdrawalMutationResponse
    }
    const id = args.input.id
    const accountingService = await ctx.container.use('accountingService')
    const amount = await accountingService.getBalance(account.id)
    if (amount === undefined) throw new Error('missing invoice account')
    if (amount === BigInt(0)) {
      return responses[
        LiquidityError.AmountZero
      ] as AccountWithdrawalMutationResponse
    }
    const error = await accountingService.createWithdrawal({
      id,
      accountId: account.id,
      amount,
      timeout: BigInt(60e9) // 1 minute
    })

    if (error) {
      return errorToResponse(error) as AccountWithdrawalMutationResponse
    }
    return {
      code: '200',
      success: true,
      message: 'Created account withdrawal',
      withdrawal: {
        id,
        amount,
        account
      }
    }
  } catch (error) {
    ctx.logger.error(
      {
        input: args.input,
        error
      },
      'error creating account withdrawal'
    )
    return {
      code: '500',
      message: 'Error trying to create account withdrawal',
      success: false
    }
  }
}

export const createInvoiceWithdrawal: MutationResolvers<ApolloContext>['createInvoiceWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['InvoiceWithdrawalMutationResponse'] => {
  try {
    const invoiceService = await ctx.container.use('invoiceService')
    const invoice = await invoiceService.get(args.input.invoiceId)
    if (!invoice) {
      return responses[
        LiquidityError.UnknownInvoice
      ] as InvoiceWithdrawalMutationResponse
    }
    const id = args.input.id
    const accountingService = await ctx.container.use('accountingService')
    const amount = await accountingService.getBalance(invoice.id)
    if (amount === undefined) throw new Error('missing invoice account')
    if (amount === BigInt(0)) {
      return responses[
        LiquidityError.AmountZero
      ] as InvoiceWithdrawalMutationResponse
    }
    const error = await accountingService.createWithdrawal({
      id,
      accountId: invoice.id,
      amount,
      timeout: BigInt(60e9) // 1 minute
    })

    if (error) {
      return errorToResponse(error) as InvoiceWithdrawalMutationResponse
    }
    return {
      code: '200',
      success: true,
      message: 'Created invoice withdrawal',
      withdrawal: {
        id,
        amount,
        invoice: {
          ...invoice,
          expiresAt: invoice.expiresAt.toISOString(),
          createdAt: invoice.createdAt?.toISOString()
        }
      }
    }
  } catch (error) {
    ctx.logger.error(
      {
        input: args.input,
        error
      },
      'error creating invoice withdrawal'
    )
    return {
      code: '500',
      message: 'Error trying to create invoice withdrawal',
      success: false
    }
  }
}

export const finalizeLiquidityWithdrawal: MutationResolvers<ApolloContext>['finalizeLiquidityWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['LiquidityMutationResponse'] => {
  const accountingService = await ctx.container.use('accountingService')
  const error = await accountingService.commitWithdrawal(args.withdrawalId)
  if (error) {
    return errorToResponse(error)
  }
  return {
    code: '200',
    success: true,
    message: 'Finalized Withdrawal'
  }
}

export const rollbackLiquidityWithdrawal: MutationResolvers<ApolloContext>['rollbackLiquidityWithdrawal'] = async (
  parent,
  args,
  ctx
): ResolversTypes['LiquidityMutationResponse'] => {
  const accountingService = await ctx.container.use('accountingService')
  const error = await accountingService.rollbackWithdrawal(args.withdrawalId)
  if (error) {
    return errorToResponse(error)
  }
  return {
    code: '200',
    success: true,
    message: 'Rolled Back Withdrawal'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
const isLiquidityError = (o: any): o is LiquidityError =>
  Object.values(LiquidityError).includes(o)

const errorToResponse = (error: TransferError): LiquidityMutationResponse => {
  if (!isLiquidityError(error)) {
    throw new Error(error)
  }
  return responses[error]
}

const responses: {
  [key in LiquidityError]: LiquidityMutationResponse
} = {
  [LiquidityError.AlreadyCommitted]: {
    code: '409',
    message: 'Withdrawal already finalized',
    success: false,
    error: LiquidityError.AlreadyCommitted
  },
  [LiquidityError.AlreadyRolledBack]: {
    code: '409',
    message: 'Withdrawal already rolled back',
    success: false,
    error: LiquidityError.AlreadyRolledBack
  },
  [LiquidityError.AmountZero]: {
    code: '400',
    message: 'Amount is zero',
    success: false,
    error: LiquidityError.AmountZero
  },
  [LiquidityError.InsufficientBalance]: {
    code: '403',
    message: 'Insufficient balance',
    success: false,
    error: LiquidityError.InsufficientBalance
  },
  [LiquidityError.InvalidId]: {
    code: '400',
    message: 'Invalid id',
    success: false,
    error: LiquidityError.InvalidId
  },
  [LiquidityError.TransferExists]: {
    code: '409',
    message: 'Transfer exists',
    success: false,
    error: LiquidityError.TransferExists
  },
  [LiquidityError.UnknownAccount]: {
    code: '404',
    message: 'Unknown account',
    success: false,
    error: LiquidityError.UnknownAccount
  },
  [LiquidityError.UnknownAsset]: {
    code: '404',
    message: 'Unknown asset',
    success: false,
    error: LiquidityError.UnknownAsset
  },
  [LiquidityError.UnknownInvoice]: {
    code: '404',
    message: 'Unknown invoice',
    success: false,
    error: LiquidityError.UnknownInvoice
  },
  [LiquidityError.UnknownPayment]: {
    code: '404',
    message: 'Unknown outgoing payment',
    success: false,
    error: LiquidityError.UnknownPayment
  },
  [LiquidityError.UnknownPeer]: {
    code: '404',
    message: 'Unknown peer',
    success: false,
    error: LiquidityError.UnknownPeer
  },
  [LiquidityError.UnknownTransfer]: {
    code: '404',
    message: 'Unknown withdrawal',
    success: false,
    error: LiquidityError.UnknownTransfer
  }
}
