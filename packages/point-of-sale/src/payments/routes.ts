import { AppContext } from '../app'
import { CardServiceClient, Result } from '../card-service-client/client'
import { BaseService } from '../shared/baseService'
import { PaymentService } from './service'
import { Deferred } from '../utils/deferred'
import { webhookWaitMap } from '../webhook-handlers/request-map'
import { WebhookBody } from '../webhook-handlers/routes'
import { IAppConfig } from '../config/app'
import {
  IncomingPaymentEventTimeoutError,
  InvalidCardPaymentError
} from './errors'

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  paymentService: PaymentService
  cardServiceClient: CardServiceClient
}

interface Amount {
  value: string
  assetScale: number
  assetCode: string
}

export interface PaymentRequestBody {
  signature: string
  payload: string
  amount: Amount
  senderWalletAddress: string
  receiverWalletAddress: string
  timestamp: number
}

type PaymentRequest = Exclude<AppContext['request'], 'body'> & {
  body: PaymentRequestBody
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
  try {
    const senderWalletAddress = await deps.paymentService.getWalletAddress(
      body.senderWalletAddress.replace(/^https:/, 'http:')
    )

    const receiverWalletAddressId =
      await deps.paymentService.getWalletAddressIdByUrl(
        body.receiverWalletAddress
      )

    const incomingPayment = await deps.paymentService.createIncomingPayment(
      receiverWalletAddressId,
      {
        ...body.amount,
        value: BigInt(body.amount.value)
      }
    )
    const deferred = new Deferred<WebhookBody>()
    webhookWaitMap.setWithExpiry(
      incomingPayment.id,
      deferred,
      deps.config.webhookTimeoutMs
    )
    const result = await deps.cardServiceClient.sendPayment(
      senderWalletAddress.cardService,
      {
        signature: body.signature,
        payload: body.payload,
        amount: body.amount,
        senderWalletAddress: body.senderWalletAddress,
        incomingPaymentUrl: incomingPayment.url,
        timestamp: body.timestamp
      }
    )

    if (result === Result.INVALID_SIGNATURE) {
      webhookWaitMap.delete(incomingPayment.id)
      ctx.body = { result: { code: Result.INVALID_SIGNATURE } }
      ctx.status = 200
      return
    }

    if (result !== Result.APPROVED) throw new InvalidCardPaymentError(result)
    const event = await waitForIncomingPaymentEvent(deps.config, deferred)
    webhookWaitMap.delete(incomingPayment.id)
    if (!event || !event.data.completed)
      throw new IncomingPaymentEventTimeoutError(incomingPayment.id)
    ctx.body = { result: { code: Result.APPROVED } }
    ctx.status = 200
  } catch (err) {
    deps.logger.debug(err)
    if (err instanceof IncomingPaymentEventTimeoutError)
      webhookWaitMap.delete(err.incomingPaymentId)
    const { body, status } = handlePaymentError(err)
    ctx.body = body
    ctx.status = status
  }
}

async function waitForIncomingPaymentEvent(
  config: IAppConfig,
  deferred: Deferred<WebhookBody>
): Promise<WebhookBody | void> {
  return Promise.race([
    deferred.promise,
    new Promise<void>((resolve) =>
      setTimeout(() => resolve(), config.webhookTimeoutMs)
    )
  ])
}

function handlePaymentError(_err: unknown) {
  return { body: { error: { code: 'invalid_request' } }, status: 400 }
}
