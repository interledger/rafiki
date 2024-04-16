import { Logger } from 'pino'
import { ReadContext, CreateContext, ListContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { OutgoingPaymentService } from './service'
import { isOutgoingPaymentError, errorToCode, errorToMessage } from './errors'
import { OutgoingPayment } from './model'
import { listSubresource } from '../../wallet_address/routes'
import {
  AccessAction,
  OutgoingPayment as OpenPaymentsOutgoingPayment
} from '@interledger/open-payments'
import {
  WalletAddress,
  throwIfMissingWalletAddress
} from '../../wallet_address/model'
import { OpenPaymentsServerRouteError } from '../../route-errors'

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
  const outgoingPayment = await deps.outgoingPaymentService.get({
    id: ctx.params.id,
    client: ctx.accessAction === AccessAction.Read ? ctx.client : undefined
  })

  if (!outgoingPayment) {
    throw new OpenPaymentsServerRouteError(
      404,
      'Outgoing payment does not exist',
      {
        id: ctx.params.id
      }
    )
  }

  throwIfMissingWalletAddress(deps, outgoingPayment)

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
    throw new OpenPaymentsServerRouteError(
      400,
      'Invalid quote id trying to create outgoing payment',
      { requestBody: body }
    )
  }

  const outgoingPaymentOrError = await deps.outgoingPaymentService.create({
    walletAddressId: ctx.walletAddress.id,
    quoteId,
    metadata: body.metadata,
    client: ctx.client,
    grant: ctx.grant
  })

  if (isOutgoingPaymentError(outgoingPaymentOrError)) {
    throw new OpenPaymentsServerRouteError(
      errorToCode[outgoingPaymentOrError],
      errorToMessage[outgoingPaymentOrError]
    )
  }

  throwIfMissingWalletAddress(deps, outgoingPaymentOrError)

  ctx.status = 201
  ctx.body = outgoingPaymentToBody(
    outgoingPaymentOrError.walletAddress,
    outgoingPaymentOrError
  )
}

async function listOutgoingPayments(
  deps: ServiceDependencies,
  ctx: ListContext
): Promise<void> {
  await listSubresource({
    ctx,
    getWalletAddressPage: deps.outgoingPaymentService.getWalletAddressPage,
    toBody: (payment) => outgoingPaymentToBody(ctx.walletAddress, payment)
  })
}

function outgoingPaymentToBody(
  walletAddress: WalletAddress,
  outgoingPayment: OutgoingPayment
): OpenPaymentsOutgoingPayment {
  return outgoingPayment.toOpenPaymentsType(walletAddress)
}
