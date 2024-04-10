import Koa from 'koa'
import { Logger } from 'pino'
import { ReadContext, CreateContext, ListContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import {
  CreateFromIncomingPayment,
  CreateFromQuote,
  CreateOutgoingPaymentOptions,
  OutgoingPaymentService,
  BaseOptions as OutgoingPaymentCreateBaseOptions
} from './service'
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
import { Amount } from '../../amount'

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

type CreateBodyBase = {
  walletAddress: string
  metadata?: Record<string, unknown>
}

type CreateBodyFromQuote = CreateBodyBase & {
  quoteId: string
}

type CreateBodyFromIncomingPayment = CreateBodyBase & {
  incomingPaymentId: string
  debitAmount: Amount
}

function isCreateFromIncomingPayment(
  body: CreateBody
): body is CreateBodyFromIncomingPayment {
  return 'incomingPaymentId' in body && 'debitAmount' in body
}

export type CreateBody = CreateBodyFromQuote | CreateBodyFromIncomingPayment

async function createOutgoingPayment(
  deps: ServiceDependencies,
  ctx: CreateContext<CreateBody>
): Promise<void> {
  const { body } = ctx.request
  let quoteId

  if (!isCreateFromIncomingPayment(body)) {
    const quoteUrlParts = body.quoteId.split('/')
    quoteId = quoteUrlParts.pop() || quoteUrlParts.pop() // handle trailing slash
    if (!quoteId) {
      return ctx.throw(400, 'invalid quoteId')
    }
  }

  let outgoingPaymentOrError: OutgoingPayment | OutgoingPaymentError

  try {
    let options: OutgoingPaymentCreateBaseOptions = {
      walletAddressId: ctx.walletAddress.id,
      metadata: body.metadata,
      client: ctx.client,
      grant: ctx.grant
    }
    if (isCreateFromIncomingPayment(body)) {
      options = {
        ...options,
        incomingPaymentId: body.incomingPaymentId,
        debitAmount: body.debitAmount
      } as CreateFromIncomingPayment
    } else {
      options = {
        ...options,
        quoteId
      } as CreateFromQuote
    }

    outgoingPaymentOrError = await deps.outgoingPaymentService.create(
      options as CreateOutgoingPaymentOptions
    )
  } catch (err) {
    const errorMessage =
      'Unhandled error when trying to create outgoing payment'
    if (isCreateFromIncomingPayment(body)) {
      deps.logger.error(
        {
          err,
          incomingPaymentId: body.incomingPaymentId,
          debitAmount: body.debitAmount,
          walletAddressId: ctx.walletAddress.id
        },
        errorMessage
      )
    } else {
      deps.logger.error(
        {
          err,
          quoteId,
          walletAddressId: ctx.walletAddress.id
        },
        errorMessage
      )
    }
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
