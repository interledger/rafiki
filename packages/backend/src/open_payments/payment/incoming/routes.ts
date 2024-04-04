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
import { IncomingPayment } from './model'
import { errorToCode, errorToMessage, isIncomingPaymentError } from './errors'
import { AmountJSON, parseAmount } from '../../amount'
import { listSubresource } from '../../wallet_address/routes'
import { StreamCredentialsService } from '../../../payment-method/ilp/stream-credentials/service'
import { AccessAction } from '@interledger/open-payments'
import { OpenPaymentsServerRouteError } from '../../errors'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  incomingPaymentService: IncomingPaymentService
  streamCredentialsService: StreamCredentialsService
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
    client: ctx.accessAction === AccessAction.Read ? ctx.client : undefined
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
    deps.config.authServerGrantUrl
  )
}

async function getIncomingPaymentPrivate(
  deps: ServiceDependencies,
  ctx: ReadContextWithAuthenticatedStatus
): Promise<void> {
  const incomingPayment = await deps.incomingPaymentService.get({
    id: ctx.params.id,
    client: ctx.accessAction === AccessAction.Read ? ctx.client : undefined
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

  if (!incomingPayment.walletAddress) {
    handleMissingWalletAddress(deps, incomingPayment)
  }

  const streamCredentials = deps.streamCredentialsService.get(incomingPayment)

  ctx.body = incomingPayment.toOpenPaymentsTypeWithMethods(
    incomingPayment.walletAddress,
    streamCredentials
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
    incomingAmount: body.incomingAmount && parseAmount(body.incomingAmount)
  })

  if (isIncomingPaymentError(incomingPaymentOrError)) {
    throw new OpenPaymentsServerRouteError(
      errorToCode[incomingPaymentOrError],
      errorToMessage[incomingPaymentOrError]
    )
  }

  if (!incomingPaymentOrError.walletAddress) {
    handleMissingWalletAddress(deps, incomingPaymentOrError)
  }

  ctx.status = 201
  const streamCredentials = deps.streamCredentialsService.get(
    incomingPaymentOrError
  )
  ctx.body = incomingPaymentOrError.toOpenPaymentsTypeWithMethods(
    incomingPaymentOrError.walletAddress,
    streamCredentials
  )
}

async function completeIncomingPayment(
  deps: ServiceDependencies,
  ctx: CompleteContext
): Promise<void> {
  const incomingPaymentOrError = await deps.incomingPaymentService.complete(
    ctx.params.id
  )

  if (isIncomingPaymentError(incomingPaymentOrError)) {
    throw new OpenPaymentsServerRouteError(
      errorToCode[incomingPaymentOrError],
      errorToMessage[incomingPaymentOrError]
    )
  }

  if (!incomingPaymentOrError.walletAddress) {
    handleMissingWalletAddress(deps, incomingPaymentOrError)
  }

  ctx.body = incomingPaymentOrError.toOpenPaymentsType(
    incomingPaymentOrError.walletAddress
  )
}

async function listIncomingPayments(
  deps: ServiceDependencies,
  ctx: ListContext
): Promise<void> {
  await listSubresource({
    ctx,
    getWalletAddressPage: deps.incomingPaymentService.getWalletAddressPage,
    toBody: (payment) => payment.toOpenPaymentsType(ctx.walletAddress)
  })
}

function handleMissingWalletAddress(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
): never {
  const errorMessage =
    'Incoming payment does not have wallet address. This should not be possible.'
  deps.logger.error({ incomingPaymentId: incomingPayment.id }, errorMessage)
  throw new Error(errorMessage)
}
