import { TransactionOrKnex } from 'objection'

import { WalletAddressKey } from './model'
import { BaseService } from '../../../shared/baseService'
import { JWK } from '@interledger/http-signature-utils'

export interface WalletAddressKeyService {
  create(options: CreateOptions): Promise<WalletAddressKey>
  revoke(id: string): Promise<WalletAddressKey | undefined>
  getKeysByWalletAddressId(walletAddressId: string): Promise<WalletAddressKey[]>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createWalletAddressKeyService({
  logger,
  knex
}: ServiceDependencies): Promise<WalletAddressKeyService> {
  const log = logger.child({
    service: 'WalletAddressKeyService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }
  return {
    create: (options) => create(deps, options),
    revoke: (id) => revoke(deps, id),
    getKeysByWalletAddressId: (walletAddressId) =>
      getKeysByWalletAddressId(deps, walletAddressId)
  }
}

interface CreateOptions {
  walletAddressId: string
  jwk: JWK
}

async function create(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<WalletAddressKey> {
  const key = await WalletAddressKey.query(deps.knex).insertAndFetch({
    walletAddressId: options.walletAddressId,
    jwk: options.jwk
  })
  return key
}

async function revoke(
  deps: ServiceDependencies,
  id: string
): Promise<WalletAddressKey | undefined> {
  const key = await WalletAddressKey.query(deps.knex).findById(id)
  if (!key) {
    return undefined
  } else if (key.revoked) {
    return key
  }

  try {
    return await key.$query(deps.knex).patchAndFetch({ revoked: true })
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

async function getKeysByWalletAddressId(
  deps: ServiceDependencies,
  walletAddressId: string
): Promise<WalletAddressKey[]> {
  const keys = await WalletAddressKey.query(deps.knex).where({
    walletAddressId,
    revoked: false
  })
  return keys
}
