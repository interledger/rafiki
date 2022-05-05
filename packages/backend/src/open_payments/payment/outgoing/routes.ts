import { Logger } from 'pino'
import { validateId } from '../../../shared/utils'
import { AppContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { OutgoingPaymentService } from './service'
import { isOutgoingPaymentError, errorToCode, errorToMessage } from './errors'
import { OutgoingPayment, OutgoingPaymentState } from './model'
import { Amount } from '../amount'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  outgoingPaymentService: OutgoingPaymentService
}

export interface OutgoingPaymentRoutes {
  get(ctx: AppContext): Promise<void>
  create(ctx: AppContext): Promise<void>
  list(ctx: AppContext): Promise<void>
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
    create: (ctx: AppContext) => createOutgoingPayment(deps, ctx),
    list: (ctx: AppContext) => listOutgoingPayments(deps, ctx)
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

  let outgoingPayment: OutgoingPayment | undefined
  try {
    outgoingPayment = await deps.outgoingPaymentService.get(outgoingPaymentId)
  } catch (_) {
    ctx.throw(500, 'Error trying to get outgoing payment')
  }
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
  let sendAmount: Amount | undefined
  if (body.sendAmount) {
    try {
      sendAmount = parseAmount(body.sendAmount)
    } catch (_) {
      return ctx.throw(400, 'invalid sendAmount')
    }
  }
  let receiveAmount: Amount | undefined
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

async function listOutgoingPayments(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const acceptJSON = ctx.accepts('application/json')
  ctx.assert(acceptJSON, 406, 'must accept json')
  const { accountId } = ctx.params
  ctx.assert(validateId(accountId), 400, 'invalid account id')
  const { first, last, cursor } = ctx.request.query
  if (
    (first !== undefined && isNaN(Number(first))) ||
    (last !== undefined && isNaN(Number(last))) ||
    (first && last) ||
    (last && !cursor) ||
    (typeof cursor !== 'string' && cursor !== undefined)
  )
    ctx.throw(400, 'invalid pagination parameters')
  const paginationParams = first
    ? {
        first: Number(first)
      }
    : last
    ? { last: Number(last) }
    : {}
  if (cursor) {
    ctx.assert(validateId(cursor), 400, 'invalid cursor')
    if (paginationParams.first) paginationParams['after'] = cursor
    if (paginationParams.last) paginationParams['before'] = cursor
  }
  let outgoingPayments: OutgoingPayment[]
  try {
    outgoingPayments = await deps.outgoingPaymentService.getAccountPage(
      accountId,
      paginationParams
    )
  } catch (_) {
    ctx.throw(500, 'Error trying to list outgoing payments')
  }
  const result = outgoingPayments.map((element) => {
    return outgoingPaymentToBody(deps, element)
  })
  const pagination = {
    startCursor: outgoingPayments[0].id,
    endCursor: outgoingPayments[outgoingPayments.length - 1].id
  }
  if (paginationParams.last) {
    pagination['last'] = outgoingPayments.length
  } else {
    pagination['first'] = outgoingPayments.length
  }

  ctx.body = { pagination, result }
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
          value: outgoingPayment.sendAmount.value.toString()
        }
      : undefined,
    receiveAmount: outgoingPayment.receiveAmount
      ? {
          ...outgoingPayment.receiveAmount,
          value: outgoingPayment.receiveAmount.value.toString()
        }
      : undefined,
    sentAmount: {
      ...outgoingPayment.sentAmount,
      value: outgoingPayment.sentAmount.value.toString()
    },
    description: outgoingPayment.description ?? undefined,
    externalRef: outgoingPayment.externalRef ?? undefined
  }
}

function parseAmount(amount: unknown): Amount {
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
    value: BigInt(amount['value']),
    assetCode: amount['assetCode'],
    assetScale: amount['assetScale']
  }
}
