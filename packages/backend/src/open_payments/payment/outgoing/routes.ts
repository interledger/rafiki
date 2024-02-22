import Koa from 'koa'
import { Logger } from 'pino'
import { ReadContext, CreateContext, ListContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { OutgoingPaymentService } from './service'
import {
  isOutgoingPaymentError,
  errorToCode,
  errorToMessage,
  OutgoingPaymentError
} from './errors'
import { OutgoingPayment } from './model'
import { listSubresource } from '../../wallet_address/routes'
import {
  AccessAction,
  OutgoingPayment as OpenPaymentsOutgoingPayment
} from '@interledger/open-payments'
import { WalletAddress } from '../../wallet_address/model'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  outgoingPaymentService: OutgoingPaymentService
}

export interface OutgoingPaymentRoutes {
  get(ctx: ReadContext): Promise<void>
  create(ctx: CreateContext<CreateBody>): Promise<void>
  list(ctx: ListContext): Promise<void>
}

export function createOutgoingPaymentRoutes(
  deps_: ServiceDependencies
): OutgoingPaymentRoutes {
  const logger = deps_.logger.child({
    service: 'OutgoingPaymentRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: ReadContext) => getOutgoingPayment(deps, ctx),
    create: (ctx: CreateContext<CreateBody>) =>
      createOutgoingPayment(deps, ctx),
    list: (ctx: ListContext) => listOutgoingPayments(deps, ctx)
  }
}

async function getOutgoingPayment(
  deps: ServiceDependencies,
  ctx: ReadContext
): Promise<void> {
  let outgoingPayment: OutgoingPayment | undefined
  try {
    outgoingPayment = await deps.outgoingPaymentService.get({
      id: ctx.params.id,
      client: ctx.accessAction === AccessAction.Read ? ctx.client : undefined
    })
  } catch (err) {
    const errorMessage = 'Unhandled error when trying to get outgoing payment'
    deps.logger.error(
      { err, id: ctx.params.id, walletAddressId: ctx.walletAddress.id },
      errorMessage
    )
    return ctx.throw(500, errorMessage)
  }
  if (!outgoingPayment || !outgoingPayment.walletAddress) return ctx.throw(404)
  ctx.body = outgoingPaymentToBody(
    outgoingPayment.walletAddress,
    outgoingPayment
  )
}

export type CreateBody = {
  walletAddress: string
  quoteId: string
  metadata?: Record<string, unknown>
}

async function createOutgoingPayment(
  deps: ServiceDependencies,
  ctx: CreateContext<CreateBody>
): Promise<void> {
  const { body } = ctx.request

  const quoteUrlParts = body.quoteId.split('/')
  const quoteId = quoteUrlParts.pop() || quoteUrlParts.pop() // handle trailing slash
  if (!quoteId) {
    return ctx.throw(400, 'invalid quoteId')
  }

  let outgoingPaymentOrError: OutgoingPayment | OutgoingPaymentError

  try {
    outgoingPaymentOrError = await deps.outgoingPaymentService.create({
      walletAddressId: ctx.walletAddress.id,
      quoteId,
      metadata: body.metadata,
      client: ctx.client,
      grant: ctx.grant
    })
  } catch (err) {
    const errorMessage =
      'Unhandled error when trying to create outgoing payment'
    deps.logger.error(
      { err, quoteId, walletAddressId: ctx.walletAddress.id },
      errorMessage
    )
    return ctx.throw(500, errorMessage)
  }

  if (isOutgoingPaymentError(outgoingPaymentOrError)) {
    return ctx.throw(
      errorToCode[outgoingPaymentOrError],
      errorToMessage[outgoingPaymentOrError]
    )
  }
  ctx.status = 201
  ctx.body = outgoingPaymentToBody(ctx.walletAddress, outgoingPaymentOrError)
}

async function listOutgoingPayments(
  deps: ServiceDependencies,
  ctx: ListContext
): Promise<void> {
  try {
    await listSubresource({
      ctx,
      getWalletAddressPage: deps.outgoingPaymentService.getWalletAddressPage,
      toBody: (payment) => outgoingPaymentToBody(ctx.walletAddress, payment)
    })
  } catch (err) {
    if (err instanceof Koa.HttpError) {
      throw err
    }

    const errorMessage = 'Unhandled error when trying to list outgoing payments'
    deps.logger.error(
      {
        err,
        request: ctx.request.query,
        walletAddressId: ctx.walletAddress.id
      },
      errorMessage
    )
    return ctx.throw(500, errorMessage)
  }
}

function outgoingPaymentToBody(
  walletAddress: WalletAddress,
  outgoingPayment: OutgoingPayment
): OpenPaymentsOutgoingPayment {
  return outgoingPayment.toOpenPaymentsType(walletAddress)
}
