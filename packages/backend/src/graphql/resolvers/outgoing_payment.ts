import { PaymentError } from '@interledger/pay'
import {
  MutationResolvers,
  OutgoingPayment as SchemaOutgoingPayment,
  PaymentState as SchemaPaymentState,
  PaymentType as SchemaPaymentType,
  QueryResolvers,
  ResolversTypes
} from '../generated/graphql'
import { OutgoingPayment } from '../../outgoing_payment/model'

export const getOutgoingPayment: QueryResolvers['outgoingPayment'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPayment'] => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  const payment = await outgoingPaymentService.get(args.id)
  if (!payment) throw new Error('payment does not exist')
  return paymentToGraphql(payment)
}

const clientErrors: { [key in PaymentError]: boolean } = {
  InvalidPaymentPointer: true,
  InvalidCredentials: true,
  InvalidSlippage: false,
  UnknownSourceAsset: true,
  UnknownPaymentTarget: true,
  InvalidSourceAmount: true,
  InvalidDestinationAmount: true,
  UnenforceableDelivery: true,
  InvalidQuote: false,

  // QueryFailed can be either a client or server error: an invalid invoice URL, or failed query.
  QueryFailed: true,
  InvoiceAlreadyPaid: false,
  ConnectorError: false,
  EstablishmentFailed: false,
  UnknownDestinationAsset: false,
  DestinationAssetConflict: false,
  ExternalRateUnavailable: false,
  RateProbeFailed: false,
  InsufficientExchangeRate: false,
  IdleTimeout: false,
  ClosedByReceiver: false,
  IncompatibleReceiveMax: false,
  ReceiverProtocolViolation: false,
  MaxSafeEncryptionLimit: false
}

export const createOutgoingPayment: MutationResolvers['createOutgoingPayment'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPaymentResponse'] => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  return outgoingPaymentService
    .create(args.input)
    .then((payment: OutgoingPayment) => ({
      code: '200',
      success: true,
      payment: paymentToGraphql(payment)
    }))
    .catch((err: Error | PaymentError) => ({
      code: typeof err === 'string' && clientErrors[err] ? '400' : '500',
      success: false,
      message: typeof err === 'string' ? err : err.message
    }))
}

export const requoteOutgoingPayment: MutationResolvers['requoteOutgoingPayment'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPaymentResponse'] => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  return outgoingPaymentService
    .requote(args.paymentId)
    .then((payment: OutgoingPayment) => ({
      code: '200',
      success: true,
      payment: paymentToGraphql(payment)
    }))
    .catch((err: Error) => ({
      code: '500',
      success: false,
      message: err.message
    }))
}

export const approveOutgoingPayment: MutationResolvers['approveOutgoingPayment'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPaymentResponse'] => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  return outgoingPaymentService
    .approve(args.paymentId)
    .then((payment: OutgoingPayment) => ({
      code: '200',
      success: true,
      payment: paymentToGraphql(payment)
    }))
    .catch((err: Error) => ({
      code: '500',
      success: false,
      message: err.message
    }))
}

export const cancelOutgoingPayment: MutationResolvers['cancelOutgoingPayment'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPaymentResponse'] => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  return outgoingPaymentService
    .cancel(args.paymentId)
    .then((payment: OutgoingPayment) => ({
      code: '200',
      success: true,
      payment: paymentToGraphql(payment)
    }))
    .catch((err: Error) => ({
      code: '500',
      success: false,
      message: err.message
    }))
}

function paymentToGraphql(payment: OutgoingPayment): SchemaOutgoingPayment {
  return {
    id: payment.id,
    state: SchemaPaymentState[payment.state],
    error: payment.error,
    attempts: payment.attempts,
    intent: {
      ...payment.intent,
      amountToSend: payment.intent.amountToSend?.toString()
    },
    quote: payment.quote && {
      ...payment.quote,
      targetType: SchemaPaymentType[payment.quote.targetType],
      timestamp: payment.quote.timestamp.toISOString(),
      activationDeadline: payment.quote.activationDeadline.toISOString(),
      minDeliveryAmount: payment.quote.minDeliveryAmount.toString(),
      maxSourceAmount: payment.quote.maxSourceAmount.toString(),
      maxPacketAmount: payment.quote.maxPacketAmount.toString()
    },
    sourceAccount: {
      scale: payment.sourceAccount.scale,
      code: payment.sourceAccount.code
    },
    destinationAccount: payment.destinationAccount,
    outcome: payment.outcome
      ? {
          amountSent: payment.outcome.amountSent.toString(),
          amountDelivered: payment.outcome.amountDelivered.toString()
        }
      : {
          amountSent: '0',
          amountDelivered: '0'
        }
  }
}
