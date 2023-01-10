import { paymentPointerToGraphql } from './payment_pointer'
import {
  ResolversTypes,
  MutationResolvers,
  LiquidityError,
  LiquidityMutationResponse,
  PaymentPointerWithdrawalMutationResponse
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
      const peer = await peerService.get(args.input.peerId)
      if (!peer) {
        return responses[LiquidityError.UnknownPeer]
      }
      const accountingService = await ctx.container.use('accountingService')
      const error = await accountingService.createDeposit({
        id: args.input.id,
        account: peer,
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

export const createPaymentPointerWithdrawal: MutationResolvers<ApolloContext>['createPaymentPointerWithdrawal'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['PaymentPointerWithdrawalMutationResponse']> => {
    try {
      const paymentPointerService = await ctx.container.use(
        'paymentPointerService'
      )
      const paymentPointer = await paymentPointerService.get(
        args.input.paymentPointerId
      )
      if (!paymentPointer) {
        return responses[
          LiquidityError.UnknownPaymentPointer
        ] as unknown as PaymentPointerWithdrawalMutationResponse
      }
      const id = args.input.id
      const accountingService = await ctx.container.use('accountingService')
      const amount = await accountingService.getBalance(paymentPointer.id)
      if (amount === undefined)
        throw new Error('missing incoming payment payment pointer')
      if (amount === BigInt(0)) {
        return responses[
          LiquidityError.AmountZero
        ] as unknown as PaymentPointerWithdrawalMutationResponse
      }
      const error = await accountingService.createWithdrawal({
        id,
        account: paymentPointer,
        amount,
        timeout: BigInt(60e9) // 1 minute
      })

      if (error) {
        return errorToResponse(
          error
        ) as unknown as PaymentPointerWithdrawalMutationResponse
      }
      return {
        code: '200',
        success: true,
        message: 'Created account withdrawal',
        withdrawal: {
          id,
          amount,
          paymentPointer: paymentPointerToGraphql(paymentPointer)
        }
      }
    } catch (error) {
      ctx.logger.error(
        {
          input: args.input,
          error
        },
        'error creating payment pointer withdrawal'
      )
      return {
        code: '500',
        message: 'Error trying to create payment pointer withdrawal',
        success: false
      }
    }
  }

export const finalizeLiquidityWithdrawal: MutationResolvers<ApolloContext>['finalizeLiquidityWithdrawal'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
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

export const rollbackLiquidityWithdrawal: MutationResolvers<ApolloContext>['rollbackLiquidityWithdrawal'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['LiquidityMutationResponse']> => {
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
      const event = await webhookService.getEvent(args.eventId)
      if (!event || !isPaymentEvent(event) || !isDepositEventType(event.type)) {
        return responses[LiquidityError.InvalidId]
      }
      if (!event.data.payment?.sendAmount) {
        throw new Error()
      }
      const outgoingPaymentService = await ctx.container.use(
        'outgoingPaymentService'
      )
      const paymentOrErr = await outgoingPaymentService.fund({
        id: event.data.payment.id,
        amount: BigInt(event.data.payment.sendAmount.value),
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
          eventId: args.eventId,
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
      const event = await webhookService.getEvent(args.eventId)
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
          eventId: args.eventId,
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
  [LiquidityError.UnknownPaymentPointer]: {
    code: '404',
    message: 'Unknown payment pointer',
    success: false,
    error: LiquidityError.UnknownPaymentPointer
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
