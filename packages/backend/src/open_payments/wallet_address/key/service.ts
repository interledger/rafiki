import { TransactionOrKnex, UniqueViolationError } from 'objection'

import { WalletAddressKey } from './model'
import { BaseService } from '../../../shared/baseService'
import { JWK } from '@interledger/http-signature-utils'
import { Pagination, SortOrder } from '../../../shared/baseModel'
import { WalletAddressKeyError } from './errors'

export interface WalletAddressKeyService {
  create(
    options: CreateOptions
  ): Promise<WalletAddressKey | WalletAddressKeyError>
  revoke(id: string): Promise<WalletAddressKey | undefined>
  getPage(
    walletAddressId: string,
    pagination?: Pagination,
    sortOrder?: SortOrder
  ): Promise<WalletAddressKey[]>
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
    getPage: (
      walletAddressId: string,
      pagination?: Pagination,
      sortOrder?: SortOrder
    ) => getWalletAddressKeyPage(deps, walletAddressId, pagination, sortOrder),
    getKeysByWalletAddressId: (walletAddressId) =>
      getKeysByWalletAddressId(deps, walletAddressId)
  }
}

export interface CreateOptions {
  walletAddressId: string
  jwk: JWK
}

async function create(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<WalletAddressKey | WalletAddressKeyError> {
  try {
    const key = await WalletAddressKey.query(deps.knex).insertAndFetch({
      walletAddressId: options.walletAddressId,
      jwk: options.jwk
    })
    return key
  } catch (err) {
    if (err instanceof UniqueViolationError) {
      return WalletAddressKeyError.DuplicateKey
    }
    deps.logger.error(
      {
        err
      },
      'error adding key'
    )
    throw err
  }
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
  } catch (err) {
    deps.logger.error(
      {
        err
      },
      'error revoking key'
    )
    throw err
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
async function getWalletAddressKeyPage(
  deps: ServiceDependencies,
  walletAddressId: string,
  pagination?: Pagination,
  sortOrder?: SortOrder
): Promise<WalletAddressKey[]> {
  return WalletAddressKey.query(deps.knex)
    .where({ walletAddressId })
    .getPage(pagination, sortOrder)
}
