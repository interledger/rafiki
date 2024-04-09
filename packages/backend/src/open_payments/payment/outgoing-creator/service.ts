import { BaseService } from '../../../shared/baseService'
import { Amount } from '../../amount'
import { Grant } from '../../grant/model'
import { isQuoteError } from '../../quote/errors'
import { QuoteService } from '../../quote/service'
import { OutgoingPaymentError } from '../outgoing/errors'
import { OutgoingPayment } from '../outgoing/model'
import { OutgoingPaymentService } from '../outgoing/service'

export interface OutgoingPaymentCreatorService {
  create(
    options: CreateOutgoingPaymentOptions
  ): Promise<OutgoingPayment | OutgoingPaymentError>
}

export interface ServiceDependencies extends BaseService {
  quoteService: QuoteService
  outgoingPaymentService: OutgoingPaymentService
}

export async function createOutgoingPaymentCreatorService(
  deps_: ServiceDependencies
): Promise<OutgoingPaymentCreatorService> {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'OutgoingPaymentCreatorService' })
  }
  return {
    create: (options: CreateOutgoingPaymentOptions) =>
      createOutgoingPayment(deps, options)
  }
}

interface BaseOptions {
  walletAddressId: string
  client?: string
  grant?: Grant
  metadata?: Record<string, unknown>
  callback?: (f: unknown) => NodeJS.Timeout
  grantLockTimeoutMs?: number
}
interface CreateFromQuote extends BaseOptions {
  quoteId: string
}
interface CreateFromIncomingPayment extends BaseOptions {
  incomingPaymentId: string
  debitAmount: Amount
}

function isCreateFromIncomingPayment(
  options: CreateOutgoingPaymentOptions
): options is CreateFromIncomingPayment {
  return 'incomingPaymentId' in options && 'debitAmount' in options
}

type CreateOutgoingPaymentOptions = CreateFromQuote | CreateFromIncomingPayment

async function createOutgoingPayment(
  deps: ServiceDependencies,
  options: CreateOutgoingPaymentOptions
): Promise<any> {
  const {
    walletAddressId,
    metadata,
    client,
    grant,
    callback,
    grantLockTimeoutMs
  } = options
  let quoteId

  if (isCreateFromIncomingPayment(options)) {
    const { debitAmount, incomingPaymentId } = options
    const quoteOrError = await deps.quoteService.create({
      receiver: incomingPaymentId,
      debitAmount,
      method: 'ilp',
      walletAddressId
    })

    if (isQuoteError(quoteOrError)) {
      throw quoteOrError
    }
    quoteId = quoteOrError.id
  } else {
    quoteId = options.quoteId
  }

  return await deps.outgoingPaymentService.create({
    walletAddressId,
    quoteId,
    metadata,
    client,
    grant,
    callback,
    grantLockTimeoutMs
  })
}
