import { walletAddressToGraphql } from './wallet_address'
import {
  ResolversTypes,
  MutationResolvers,
  LiquidityError,
  LiquidityMutationResponse,
  WalletAddressWithdrawalMutationResponse,
  AssetResolvers,
  PeerResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import {
  FundingError,
  isFundingError
} from '../../open_payments/payment/outgoing/errors'
import {
  isPaymentEvent,
  PaymentDepositType
} from '../../open_payments/payment/outgoing/model'
import { PeerError } from '../../payment-method/ilp/peer/errors'

export const getAssetLiquidity: AssetResolvers<ApolloContext>['liquidity'] =
  async (parent, args, ctx): Promise<ResolversTypes['UInt64']> => {
    return await getLiquidity(ctx, parent.id as string)
  }

export const getPeerLiquidity: PeerResolvers<ApolloContext>['liquidity'] =
  async (parent, args, ctx): Promise<ResolversTypes['UInt64']> => {
    return await getLiquidity(ctx, parent.id as string)
  }

const getLiquidity = async (
  ctx: ApolloContext,
  id: string
): Promise<bigint> => {
  const accountingService = await ctx.container.use('accountingService')
  const liquidity = await accountingService.getBalance(id)
  if (liquidity === undefined) {
    throw new Error('No liquidity account found')
  }
  return liquidity
}

export const addPeerLiquidity: MutationResolvers<ApolloContext>['addPeerLiquidity'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
    try {
      if (args.input.amount === BigInt(0)) {
        return responses[LiquidityError.AmountZero]
      }
      const peerService = await ctx.container.use('peerService')
      const peerOrError = await peerService.addLiquidity({
        transferId: args.input.id,
        peerId: args.input.peerId,
        amount: args.input.amount
      })

      if (peerOrError === PeerError.UnknownPeer) {
        return responses[LiquidityError.UnknownPeer]
      } else if (isLiquidityError(peerOrError)) {
        return errorToResponse(peerOrError)
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

export const addAssetLiquidity: MutationResolvers<ApolloContext>['addAssetLiquidity'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
    try {
      if (args.input.amount === BigInt(0)) {
        return responses[LiquidityError.AmountZero]
      }
      const assetService = await ctx.container.use('assetService')
      const asset = await assetService.get(args.input.assetId)
      if (!asset) {
        return responses[LiquidityError.UnknownAsset]
      }
      const accountingService = await ctx.container.use('accountingService')
      const error = await accountingService.createDeposit({
        id: args.input.id,
        account: asset,
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

export const createPeerLiquidityWithdrawal: MutationResolvers<ApolloContext>['createPeerLiquidityWithdrawal'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
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
        account: peer,
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

export const createAssetLiquidityWithdrawal: MutationResolvers<ApolloContext>['createAssetLiquidityWithdrawal'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
    try {
      if (args.input.amount === BigInt(0)) {
        return responses[LiquidityError.AmountZero]
      }
      const assetService = await ctx.container.use('assetService')
      const asset = await assetService.get(args.input.assetId)
      if (!asset) {
        return responses[LiquidityError.UnknownAsset]
      }
      const accountingService = await ctx.container.use('accountingService')
      const error = await accountingService.createWithdrawal({
        id: args.input.id,
        account: asset,
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

export const createWalletAddressWithdrawal: MutationResolvers<ApolloContext>['createWalletAddressWithdrawal'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WalletAddressWithdrawalMutationResponse']> => {
    try {
      const walletAddressService = await ctx.container.use(
        'walletAddressService'
      )
      const walletAddress = await walletAddressService.get(
        args.input.walletAddressId
      )
      if (!walletAddress) {
        return responses[
          LiquidityError.UnknownWalletAddress
        ] as unknown as WalletAddressWithdrawalMutationResponse
      }
      const id = args.input.id
      const accountingService = await ctx.container.use('accountingService')
      const amount = await accountingService.getBalance(walletAddress.id)
      if (amount === undefined)
        throw new Error('missing incoming payment wallet address')
      if (amount === BigInt(0)) {
        return responses[
          LiquidityError.AmountZero
        ] as unknown as WalletAddressWithdrawalMutationResponse
      }
      const error = await accountingService.createWithdrawal({
        id,
        account: walletAddress,
        amount,
        timeout: BigInt(60e9) // 1 minute
      })

      if (error) {
        return errorToResponse(
          error
        ) as unknown as WalletAddressWithdrawalMutationResponse
      }
      return {
        code: '200',
        success: true,
        message: 'Created account withdrawal',
        withdrawal: {
          id,
          amount,
          walletAddress: walletAddressToGraphql(walletAddress)
        }
      }
    } catch (error) {
      ctx.logger.error(
        {
          input: args.input,
          error
        },
        'error creating wallet address withdrawal'
      )
      return {
        code: '500',
        message: 'Error trying to create wallet address withdrawal',
        success: false
      }
    }
  }

export const postLiquidityWithdrawal: MutationResolvers<ApolloContext>['postLiquidityWithdrawal'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
    const accountingService = await ctx.container.use('accountingService')
    const error = await accountingService.postWithdrawal(
      args.input.withdrawalId
    )
    if (error) {
      return errorToResponse(error)
    }
    return {
      code: '200',
      success: true,
      message: 'Posted Withdrawal'
    }
  }

export const voidLiquidityWithdrawal: MutationResolvers<ApolloContext>['voidLiquidityWithdrawal'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
    const accountingService = await ctx.container.use('accountingService')
    const error = await accountingService.voidWithdrawal(
      args.input.withdrawalId
    )
    if (error) {
      return errorToResponse(error)
    }
    return {
      code: '200',
      success: true,
      message: 'Voided Withdrawal'
    }
  }

export const DepositEventType = PaymentDepositType
export type DepositEventType = PaymentDepositType

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
const isDepositEventType = (o: any): o is DepositEventType =>
  Object.values(DepositEventType).includes(o)

export const depositEventLiquidity: MutationResolvers<ApolloContext>['depositEventLiquidity'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
    try {
      const webhookService = await ctx.container.use('webhookService')
      const event = await webhookService.getEvent(args.input.eventId)
      if (!event || !isPaymentEvent(event) || !isDepositEventType(event.type)) {
        return responses[LiquidityError.InvalidId]
      }
      if (!event.data.debitAmount) {
        throw new Error()
      }
      const outgoingPaymentService = await ctx.container.use(
        'outgoingPaymentService'
      )
      const paymentOrErr = await outgoingPaymentService.fund({
        id: event.data.id,
        amount: BigInt(event.data.debitAmount.value),
        transferId: event.id
      })
      if (isFundingError(paymentOrErr)) {
        return errorToResponse(paymentOrErr)
      }
      return {
        code: '200',
        success: true,
        message: 'Deposited liquidity'
      }
    } catch (error) {
      ctx.logger.error(
        {
          eventId: args.input.eventId,
          error
        },
        'error depositing liquidity'
      )
      return {
        code: '400',
        message: 'Error trying to deposit liquidity',
        success: false
      }
    }
  }

export const withdrawEventLiquidity: MutationResolvers<ApolloContext>['withdrawEventLiquidity'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
    try {
      const webhookService = await ctx.container.use('webhookService')
      const event = await webhookService.getEvent(args.input.eventId)
      if (!event || !event.withdrawal) {
        return responses[LiquidityError.InvalidId]
      }
      const assetService = await ctx.container.use('assetService')
      const asset = await assetService.get(event.withdrawal.assetId)
      if (!asset) {
        throw new Error()
      }
      const accountingService = await ctx.container.use('accountingService')
      const error = await accountingService.createWithdrawal({
        id: event.id,
        account: {
          id: event.withdrawal.accountId,
          asset
        },
        amount: event.withdrawal.amount
      })
      if (error) {
        return errorToResponse(error)
      }
      // TODO: check for and handle leftover incoming payment or payment balance
      return {
        code: '200',
        success: true,
        message: 'Withdrew liquidity'
      }
    } catch (error) {
      ctx.logger.error(
        {
          eventId: args.input.eventId,
          error
        },
        'error withdrawing liquidity'
      )
      return {
        code: '400',
        message: 'Error trying to withdraw liquidity',
        success: false
      }
    }
  }

export const depositOutgoingPaymentLiquidity: MutationResolvers<ApolloContext>['depositOutgoingPaymentLiquidity'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
    return {
      code: '400',
      message: 'Error trying to deposit liquidity',
      success: false
    }
    // try {
    //   const webhookService = await ctx.container.use('webhookService')
    //   const event = await webhookService.getEvent(args.input.eventId)
    //   if (!event || !isPaymentEvent(event) || !isDepositEventType(event.type)) {
    //     return responses[LiquidityError.InvalidId]
    //   }
    //   if (!event.data.debitAmount) {
    //     throw new Error()
    //   }
    //   const outgoingPaymentService = await ctx.container.use(
    //     'outgoingPaymentService'
    //   )
    //   const paymentOrErr = await outgoingPaymentService.fund({
    //     id: event.data.id,
    //     amount: BigInt(event.data.debitAmount.value),
    //     transferId: event.id
    //   })
    //   if (isFundingError(paymentOrErr)) {
    //     return errorToResponse(paymentOrErr)
    //   }
    //   return {
    //     code: '200',
    //     success: true,
    //     message: 'Deposited liquidity'
    //   }
    // } catch (error) {
    //   ctx.logger.error(
    //     {
    //       eventId: args.input.eventId,
    //       error
    //     },
    //     'error depositing liquidity'
    //   )
    //   return {
    //     code: '400',
    //     message: 'Error trying to deposit liquidity',
    //     success: false
    //   }
    // }
  }

export const withdrawIncomingPaymentLiquidity: MutationResolvers<ApolloContext>['withdrawIncomingPaymentLiquidity'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
    const { incomingPaymentId } = args.input
    try {
      const incomingPaymentService = await ctx.container.use(
        'incomingPaymentService'
      )
      const incomingPayment = await incomingPaymentService.get({
        id: incomingPaymentId
      })
      if (!incomingPayment || !incomingPayment.incomingAmount) {
        return responses[LiquidityError.InvalidId]
      }

      const accountingService = await ctx.container.use('accountingService')
      const error = await accountingService.createWithdrawal({
        id: incomingPaymentId,
        account: {
          id: incomingPaymentId,
          asset: incomingPayment.asset
        },
        amount: incomingPayment.receivedAmount.value
      })

      if (error) {
        return errorToResponse(error)
      }
      return {
        code: '200',
        success: true,
        message: 'Withdrew liquidity'
      }
    } catch (error) {
      ctx.logger.error(
        {
          incomingPaymentId,
          error
        },
        'error withdrawing liquidity'
      )
      return {
        code: '400',
        message: 'Error trying to withdraw liquidity',
        success: false
      }
    }
  }

export const withdrawOutgoingPaymentLiquidity: MutationResolvers<ApolloContext>['withdrawOutgoingPaymentLiquidity'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
    return {
      code: '400',
      message: 'Error trying to withdraw liquidity',
      success: false
    }
    // try {
    //   const webhookService = await ctx.container.use('webhookService')
    //   const event = await webhookService.getEvent(args.input.eventId)
    //   if (!event || !event.withdrawal) {
    //     return responses[LiquidityError.InvalidId]
    //   }
    //   const assetService = await ctx.container.use('assetService')
    //   const asset = await assetService.get(event.withdrawal.assetId)
    //   if (!asset) {
    //     throw new Error()
    //   }
    //   const accountingService = await ctx.container.use('accountingService')
    //   const error = await accountingService.createWithdrawal({
    //     id: event.id,
    //     account: {
    //       id: event.withdrawal.accountId,
    //       asset
    //     },
    //     amount: event.withdrawal.amount
    //   })
    //   if (error) {
    //     return errorToResponse(error)
    //   }
    //   // TODO: check for and handle leftover incoming payment or payment balance
    //   return {
    //     code: '200',
    //     success: true,
    //     message: 'Withdrew liquidity'
    //   }
    // } catch (error) {
    //   ctx.logger.error(
    //     {
    //       eventId: args.input.eventId,
    //       error
    //     },
    //     'error withdrawing liquidity'
    //   )
    //   return {
    //     code: '400',
    //     message: 'Error trying to withdraw liquidity',
    //     success: false
    //   }
    // }
  }

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
const isLiquidityError = (o: any): o is LiquidityError =>
  Object.values(LiquidityError).includes(o)

const errorToResponse = (error: FundingError): LiquidityMutationResponse => {
  if (!isLiquidityError(error)) {
    throw new Error(error)
  }
  return responses[error]
}

const responses: {
  [key in LiquidityError]: LiquidityMutationResponse
} = {
  [LiquidityError.AlreadyPosted]: {
    code: '409',
    message: 'Withdrawal already posted',
    success: false,
    error: LiquidityError.AlreadyPosted
  },
  [LiquidityError.AlreadyVoided]: {
    code: '409',
    message: 'Withdrawal already voided',
    success: false,
    error: LiquidityError.AlreadyVoided
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
  [LiquidityError.UnknownWalletAddress]: {
    code: '404',
    message: 'Unknown wallet address',
    success: false,
    error: LiquidityError.UnknownWalletAddress
  },
  [LiquidityError.UnknownAsset]: {
    code: '404',
    message: 'Unknown asset',
    success: false,
    error: LiquidityError.UnknownAsset
  },
  [LiquidityError.UnknownIncomingPayment]: {
    code: '404',
    message: 'Unknown incoming payment',
    success: false,
    error: LiquidityError.UnknownIncomingPayment
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
