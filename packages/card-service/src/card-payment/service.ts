import { CardPayment } from './model'
import { BaseService } from '../shared/baseService'

export interface CreateCardPaymentOptions {
  requestId: string
  requestedAt: Date | null
  cardWalletAddress: string
  incomingPaymentUrl: string
  terminalId: string
}

export interface UpdateCardPaymentOptions {
  requestId: string
  finalizedAt?: Date | null
  statusCode?: number
  outgoingPaymentId?: string
}

export interface AuditLogService {
  create(options: CreateCardPaymentOptions): Promise<CardPayment>
  update(options: UpdateCardPaymentOptions): Promise<CardPayment | undefined>
}

interface ServiceDependencies extends BaseService {}

export async function createAuditLogService({
  logger,
  knex
}: ServiceDependencies): Promise<AuditLogService> {
  const log = logger.child({
    service: 'AuditLogService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    knex
  }

  return {
    create: (options) => createCardPayment(deps, options),
    update: (options) => updateCardPayment(deps, options)
  }
}

async function createCardPayment(
  deps: ServiceDependencies,
  {
    requestId,
    requestedAt,
    cardWalletAddress,
    incomingPaymentUrl,
    terminalId
  }: CreateCardPaymentOptions
): Promise<CardPayment> {
  const cardPayment = await CardPayment.query(deps.knex).insertAndFetch({
    requestId,
    requestedAt,
    cardWalletAddress,
    incomingPaymentUrl,
    terminalId
  })

  return cardPayment
}

async function updateCardPayment(
  deps: ServiceDependencies,
  {
    requestId,
    finalizedAt,
    statusCode,
    outgoingPaymentId
  }: UpdateCardPaymentOptions
): Promise<CardPayment | undefined> {
  if (!deps.knex) {
    throw new Error('Knex undefined')
  }
  const existingPayment = await CardPayment.query(deps.knex)
    .findOne('requestId', requestId)
    .throwIfNotFound()

  const cardPayment = await CardPayment.query(deps.knex).patchAndFetchById(
    existingPayment.id,
    {
      finalizedAt,
      statusCode,
      outgoingPaymentId
    }
  )

  return cardPayment
}
