import { TransactionOrKnex } from 'objection'

import { PaymentPointerKeys } from './model'
import { BaseService } from '../shared/baseService'

export interface PaymentPointerKeysService {
  getKeyById(keyId: string): Promise<PaymentPointerKeys>
  revokeKeyById(keyId: string): Promise<string>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createPaymentPointerKeysService({
  logger,
  knex
}: ServiceDependencies): Promise<PaymentPointerKeysService> {
  const log = logger.child({
    service: 'PaymentPointerKeysService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }
  return {
    getKeyById: (keyId) => getKeyById(deps, keyId),
    revokeKeyById: (keyId) => revokeKeyById(deps, keyId)
  }
}

async function getKeyById(
  deps: ServiceDependencies,
  // In the form https://somedomain/keys/{keyId}
  keyId: string
): Promise<PaymentPointerKeys> {
  const key = await PaymentPointerKeys.query(deps.knex).findById(keyId)
  if (!key) return null
  return key
}

async function revokeKeyById(
  deps: ServiceDependencies,
  keyId: string
): Promise<string> {
  const key = await PaymentPointerKeys.query(deps.knex).findById(keyId)

  const revokedJwk = key.jwk
  revokedJwk.revoked = true

  try {
    const revokedKey = await key
      .$query(deps.knex)
      .patchAndFetch({ jwk: revokedJwk })

    return revokedKey.id
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
