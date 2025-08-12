import { AppContext } from '../app'
import { CardServiceClient, Result } from '../card-service-client/client'
import { AmountInput } from '../graphql/generated/graphql'
import { BaseService } from '../shared/baseService'
import { PaymentService } from './service'
import { CardServiceClientError } from '../card-service-client/errors'

interface ServiceDependencies extends BaseService {
  paymentService: PaymentService
  cardServiceClient: CardServiceClient
}

export type PaymentBody = {
  card: {
    walletAddress: string
    trasactionCounter: number
    expiry: Date
  }
  signature: string
  value: bigint
  merchantWalletAddress: string
}
type PaymentRequest = Exclude<AppContext['request'], 'body'> & {
  body: PaymentBody
}

export type PaymentContext = Exclude<AppContext, 'request'> & {
  request: PaymentRequest
}

export interface PaymentRoutes {
  payment(ctx: PaymentContext): Promise<void>
}

export function createPaymentRoutes(deps_: ServiceDependencies): PaymentRoutes {
  const log = deps_.logger.child({
    service: 'PaymentRoutes'
  })

  const deps = {
    ...deps_,
    logger: log
  }

  return {
    payment: (ctx: PaymentContext) => payment(deps, ctx)
  }
}

async function payment(
  deps: ServiceDependencies,
  ctx: PaymentContext
): Promise<void> {
  const body = ctx.request.body
  // 1. Get the walletAddress by walletAddressUrl
  try {
    const walletAddress = await deps.paymentService.getWalletAddress(
      body.card.walletAddress
    )
    // 2. Call Rafiki BE to create an incoming payment
    const incomingAmount: AmountInput = {
      assetCode: walletAddress.assetCode,
      assetScale: walletAddress.assetScale,
      value: body.value
    }
    const incomingPaymentUrl = await deps.paymentService.createIncomingPayment(
      walletAddress.id,
      incomingAmount
    )

    // 3. Call card service client
    const result = await deps.cardServiceClient.sendPayment({
      merchantWalletAddress: body.merchantWalletAddress,
      incomingPaymentUrl,
      date: new Date(),
      signature: body.signature,
      card: body.card
    })

    ctx.body = result
    ctx.status = result === Result.APPROVED ? 200 : 401
  } catch (err) {
    const { body, status } = handlePaymentError(err)
    ctx.body = body
    ctx.status = status
  }
}

function handlePaymentError(err: unknown) {
  if (err instanceof CardServiceClientError) {
    return { body: err.message, status: err.status }
  }
  if (err instanceof Error) {
    return { body: err.message, status: 400 }
  }
  return { body: err, status: 500 }
}
