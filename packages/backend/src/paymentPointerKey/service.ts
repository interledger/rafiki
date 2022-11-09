import { TransactionOrKnex } from 'objection'

import { PaymentPointerKey } from './model'
import { BaseService } from '../shared/baseService'
import { JWKWithRequired } from 'auth'

export interface PaymentPointerKeyService {
  create(options: CreateOptions): Promise<PaymentPointerKey>
  revoke(id: string): Promise<PaymentPointerKey | undefined>
  getKeysByPaymentPointerId(
    paymentPointerId: string
  ): Promise<PaymentPointerKey[]>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createPaymentPointerKeyService({
  logger,
  knex
}: ServiceDependencies): Promise<PaymentPointerKeyService> {
  const log = logger.child({
    service: 'PaymentPointerKeyService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }
  return {
    create: (options) => create(deps, options),
    revoke: (id) => revoke(deps, id),
    getKeysByPaymentPointerId: (paymentPointerId) =>
      getKeysByPaymentPointerId(deps, paymentPointerId)
  }
}

interface CreateOptions {
  paymentPointerId: string
  jwk: JWKWithRequired
}

async function create(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<PaymentPointerKey> {
  const key = await PaymentPointerKey.query(deps.knex).insertAndFetch({
    paymentPointerId: options.paymentPointerId,
    jwk: options.jwk
  })
  return key
}

async function revoke(
  deps: ServiceDependencies,
  id: string
): Promise<PaymentPointerKey | undefined> {
  const key = await PaymentPointerKey.query(deps.knex).findById(id)
  if (!key) {
    return undefined
  }

  const revokedJwk = key.jwk
  revokedJwk.revoked = true

  try {
    const revokedKey = await key
      .$query(deps.knex)
      .patchAndFetch({ jwk: revokedJwk })

    return revokedKey
  } catch (error) {
    deps.logger.error(
      {
        error
      },
      'error revoking key'
    )
    throw error
  }
}

async function getKeysByPaymentPointerId(
  deps: ServiceDependencies,
  paymentPointerId: string
): Promise<PaymentPointerKey[]> {
  const keys = await PaymentPointerKey.query(deps.knex).where({
    paymentPointerId
  })
  return keys
}
