import { Logger } from 'pino'
import {
  ReadContext,
  CreateContext,
  CompleteContext,
  ListContext,
  AuthenticatedStatusContext
} from '../../../app'
import { IAppConfig } from '../../../config/app'
import { IncomingPaymentService } from './service'
import {
  errorToHTTPCode,
  errorToMessage,
  isIncomingPaymentError
} from './errors'
import { AmountJSON, parseAmount } from '../../amount'
import { listSubresource } from '../../wallet_address/routes'
import { AccessAction } from '@interledger/open-payments'
import { OpenPaymentsServerRouteError } from '../../route-errors'
import { PaymentMethodProviderService } from '../../../payment-method/provider/service'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  incomingPaymentService: IncomingPaymentService
  paymentMethodProviderService: PaymentMethodProviderService
}

export type ReadContextWithAuthenticatedStatus = ReadContext &
  AuthenticatedStatusContext

export interface IncomingPaymentRoutes {
  get(ctx: ReadContextWithAuthenticatedStatus): Promise<void>
  create(ctx: CreateContext<CreateBody>): Promise<void>
  complete(ctx: CompleteContext): Promise<void>
  list(ctx: ListContext): Promise<void>
}

export function createIncomingPaymentRoutes(
  deps_: ServiceDependencies
): IncomingPaymentRoutes {
  const logger = deps_.logger.child({
    service: 'IncomingPaymentRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: ReadContextWithAuthenticatedStatus) =>
      getIncomingPayment(deps, ctx),
    create: (ctx: CreateContext<CreateBody>) =>
      createIncomingPayment(deps, ctx),
    complete: (ctx: CompleteContext) => completeIncomingPayment(deps, ctx),
    list: (ctx: ListContext) => listIncomingPayments(deps, ctx)
  }
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  ctx: ReadContextWithAuthenticatedStatus
) {
  if (ctx.authenticated) {
    await getIncomingPaymentPrivate(deps, ctx)
  } else {
    await getIncomingPaymentPublic(deps, ctx)
  }
}

async function getIncomingPaymentPublic(
  deps: ServiceDependencies,
  ctx: ReadContextWithAuthenticatedStatus
) {
  const incomingPayment = await deps.incomingPaymentService.get({
    id: ctx.params.id,
    client: ctx.accessAction === AccessAction.Read ? ctx.client : undefined,
    tenantId: ctx.params.tenantId
  })

  if (!incomingPayment) {
    throw new OpenPaymentsServerRouteError(
      404,
      'Incoming payment does not exist',
      {
        id: ctx.params.id
      }
    )
  }

  ctx.body = incomingPayment.toPublicOpenPaymentsType(
    `${deps.config.authServerGrantUrl}/${incomingPayment?.walletAddress?.tenantId}`
  )
}

async function getIncomingPaymentPrivate(
  deps: ServiceDependencies,
  ctx: ReadContextWithAuthenticatedStatus
): Promise<void> {
  const incomingPayment = await deps.incomingPaymentService.get({
    id: ctx.params.id,
    client: ctx.accessAction === AccessAction.Read ? ctx.client : undefined,
    tenantId: ctx.params.tenantId
  })

  if (!incomingPayment) {
    throw new OpenPaymentsServerRouteError(
      404,
      'Incoming payment does not exist',
      {
        id: ctx.params.id
      }
    )
  }

  const paymentMethods = incomingPayment.isExpiredOrComplete()
    ? []
    : await deps.paymentMethodProviderService.getPaymentMethods(incomingPayment)

  ctx.body = incomingPayment.toOpenPaymentsTypeWithMethods(
    deps.config.openPaymentsUrl,
    ctx.walletAddress,
    paymentMethods
  )
}

export type CreateBody = {
  walletAddress: string
  expiresAt?: string
  incomingAmount?: AmountJSON
  metadata?: Record<string, unknown>
}

async function createIncomingPayment(
  deps: ServiceDependencies,
  ctx: CreateContext<CreateBody>
): Promise<void> {
  const { body } = ctx.request

  let expiresAt: Date | undefined
  if (body.expiresAt !== undefined) {
    expiresAt = new Date(body.expiresAt)
  }

  const incomingPaymentOrError = await deps.incomingPaymentService.create({
    walletAddressId: ctx.walletAddress.id,
    client: ctx.client,
    metadata: body.metadata,
    expiresAt,
    incomingAmount: body.incomingAmount && parseAmount(body.incomingAmount),
    tenantId: ctx.params.tenantId
  })

  if (isIncomingPaymentError(incomingPaymentOrError)) {
    throw new OpenPaymentsServerRouteError(
      errorToHTTPCode[incomingPaymentOrError],
      errorToMessage[incomingPaymentOrError]
    )
  }
  const paymentMethods =
    await deps.paymentMethodProviderService.getPaymentMethods(
      incomingPaymentOrError
    )

  ctx.status = 201
  ctx.body = incomingPaymentOrError.toOpenPaymentsTypeWithMethods(
    deps.config.openPaymentsUrl,
    ctx.walletAddress,
    paymentMethods
  )
}

async function completeIncomingPayment(
  deps: ServiceDependencies,
  ctx: CompleteContext
): Promise<void> {
  const incomingPaymentOrError = await deps.incomingPaymentService.complete(
    ctx.params.id,
    ctx.params.tenantId
  )

  if (isIncomingPaymentError(incomingPaymentOrError)) {
    throw new OpenPaymentsServerRouteError(
      errorToHTTPCode[incomingPaymentOrError],
      errorToMessage[incomingPaymentOrError]
    )
  }

  ctx.body = incomingPaymentOrError.toOpenPaymentsType(
    deps.config.openPaymentsUrl,
    ctx.walletAddress
  )
}

async function listIncomingPayments(
  deps: ServiceDependencies,
  ctx: ListContext
): Promise<void> {
  await listSubresource({
    ctx,
    getWalletAddressPage: async ({ walletAddressId, pagination, client }) =>
      deps.incomingPaymentService.getWalletAddressPage({
        walletAddressId,
        pagination,
        client,
        tenantId: ctx.params.tenantId
      }),
    toBody: (payment) =>
      payment.toOpenPaymentsType(deps.config.openPaymentsUrl, ctx.walletAddress)
  })
}
