import { Logger } from 'pino'
import { validateId } from '../../../shared/utils'
import { AppContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { OutgoingPaymentService } from './service'
import { isOutgoingPaymentError, errorToCode, errorToMessage } from './errors'
import { OutgoingPayment, PaymentAmount, OutgoingPaymentState } from './model'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  outgoingPaymentService: OutgoingPaymentService
}

export interface OutgoingPaymentRoutes {
  get(ctx: AppContext): Promise<void>
  create(ctx: AppContext): Promise<void>
}

export function createOutgoingPaymentRoutes(
  deps_: ServiceDependencies
): OutgoingPaymentRoutes {
  const logger = deps_.logger.child({
    service: 'OutgoingPaymentRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: AppContext) => getOutgoingPayment(deps, ctx),
    create: (ctx: AppContext) => createOutgoingPayment(deps, ctx)
  }
}

async function getOutgoingPayment(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { outgoingPaymentId: outgoingPaymentId } = ctx.params
  ctx.assert(validateId(outgoingPaymentId), 400, 'invalid id')
  const acceptJSON = ctx.accepts('application/json')
  ctx.assert(acceptJSON, 406)

  const outgoingPayment = await deps.outgoingPaymentService.get(
    outgoingPaymentId
  )
  if (!outgoingPayment) return ctx.throw(404)

  const body = outgoingPaymentToBody(deps, outgoingPayment)
  ctx.body = body
}

async function createOutgoingPayment(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { accountId } = ctx.params
  ctx.assert(validateId(accountId), 400, 'invalid account id')
  ctx.assert(ctx.accepts('application/json'), 406, 'must accept json')
  ctx.assert(
    ctx.get('Content-Type') === 'application/json',
    400,
    'must send json body'
  )

  const { body } = ctx.request
  if (typeof body !== 'object') return ctx.throw(400, 'json body required')

  if (
    body.receivingAccount !== undefined &&
    typeof body.receivingAccount !== 'string'
  )
    return ctx.throw(400, 'invalid receivingAccount')
  let sendAmount: PaymentAmount | undefined
  if (body.sendAmount) {
    try {
      sendAmount = parseAmount(body.sendAmount)
    } catch (_) {
      return ctx.throw(400, 'invalid sendAmount')
    }
  }
  let receiveAmount: PaymentAmount | undefined
  if (body.receiveAmount) {
    try {
      receiveAmount = parseAmount(body.receiveAmount)
    } catch (_) {
      return ctx.throw(400, 'invalid receiveAmount')
    }
  }
  if (
    body.receivingPayment !== undefined &&
    typeof body.receivingPayment !== 'string'
  )
    return ctx.throw(400, 'invalid receivingPayment')

  if (body.description !== undefined && typeof body.description !== 'string')
    return ctx.throw(400, 'invalid description')
  if (body.externalRef !== undefined && typeof body.externalRef !== 'string')
    return ctx.throw(400, 'invalid externalRef')

  const paymentOrErr = await deps.outgoingPaymentService.create({
    accountId,
    receivingAccount: body.receivingAccount,
    sendAmount,
    receiveAmount,
    receivingPayment: body.receivingPayment,
    description: body.description,
    externalRef: body.externalRef
  })

  if (isOutgoingPaymentError(paymentOrErr)) {
    return ctx.throw(errorToCode[paymentOrErr], errorToMessage[paymentOrErr])
  }

  ctx.status = 201
  const res = outgoingPaymentToBody(deps, paymentOrErr)
  ctx.body = res
}

function outgoingPaymentToBody(
  deps: ServiceDependencies,
  outgoingPayment: OutgoingPayment
) {
  const accountId = `${deps.config.publicHost}/${outgoingPayment.accountId}`
  return {
    id: `${accountId}/outgoing-payments/${outgoingPayment.id}`,
    accountId,
    state: [
      OutgoingPaymentState.Funding,
      OutgoingPaymentState.Sending
    ].includes(outgoingPayment.state)
      ? 'processing'
      : outgoingPayment.state.toLowerCase(),
    receivingAccount: outgoingPayment.receivingAccount ?? undefined,
    receivingPayment: outgoingPayment.receivingPayment ?? undefined,
    sendAmount: outgoingPayment.sendAmount
      ? {
          ...outgoingPayment.sendAmount,
          amount: outgoingPayment.sendAmount.amount.toString()
        }
      : undefined,
    receiveAmount: outgoingPayment.receiveAmount
      ? {
          ...outgoingPayment.receiveAmount,
          amount: outgoingPayment.receiveAmount.amount.toString()
        }
      : undefined,
    description: outgoingPayment.description ?? undefined,
    externalRef: outgoingPayment.externalRef ?? undefined
  }
}

function parseAmount(amount: unknown): PaymentAmount {
  if (
    typeof amount !== 'object' ||
    amount === null ||
    (amount['assetCode'] && typeof amount['assetCode'] !== 'string') ||
    (amount['assetScale'] !== undefined &&
      typeof amount['assetScale'] !== 'number')
  ) {
    throw new Error('invalid amount')
  }
  return {
    amount: BigInt(amount['amount']),
    assetCode: amount['assetCode'],
    assetScale: amount['assetScale']
  }
}
