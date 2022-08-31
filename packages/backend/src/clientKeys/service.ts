import { TransactionOrKnex } from 'objection'

import { ClientKeys } from './model'
import { BaseService } from '../shared/baseService'

export interface ClientKeysService {
  getKeyById(keyId: string): Promise<ClientKeys>
  revokeKeyById(keyId: string): Promise<string>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createClientKeysService({
  logger,
  knex
}: ServiceDependencies): Promise<ClientKeysService> {
  const log = logger.child({
    service: 'ClientKeysService'
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
): Promise<ClientKeys> {
  const key = await ClientKeys.query(deps.knex).findById(keyId)
  if (!key) return null
  return key
}

async function revokeKeyById(
  deps: ServiceDependencies,
  keyId: string
): Promise<string> {
  const key = await ClientKeys.query(deps.knex).findById(keyId)

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
