import assert from 'assert'
import { Transaction } from 'knex'

import { PeerError, isPeerError } from './errors'
import { Peer } from './model'
import {
  AccountService,
  CreateOptions as CreateAccountOptions,
  UpdateOptions
} from '../account/service'
import { isAccountError } from '../account/errors'
import { AssetService, AssetOptions } from '../asset/service'
import { BaseService } from '../shared/baseService'
import { Pagination } from '../shared/pagination'

export type CreateOptions = Omit<CreateAccountOptions, 'id' | 'assetId'> & {
  asset: AssetOptions
  http: {
    incoming?: {
      authTokens: string[]
    }
    outgoing: {
      authToken: string
      endpoint: string
    }
  }
  routing: {
    staticIlpAddress: string
  }
}

export { UpdateOptions }

export interface PeerService {
  get(id: string): Promise<Peer | undefined>
  create(options: CreateOptions, trx?: Transaction): Promise<Peer | PeerError>
  update(options: UpdateOptions): Promise<Peer | PeerError>
  getPage(pagination?: Pagination): Promise<Peer[]>
}

interface ServiceDependencies extends BaseService {
  accountService: AccountService
  assetService: AssetService
}

export async function createPeerService({
  logger,
  knex,
  accountService,
  assetService
}: ServiceDependencies): Promise<PeerService> {
  const log = logger.child({
    service: 'PeerService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    accountService,
    assetService
  }
  return {
    get: (id) => getPeer(deps, id),
    create: (options, trx) => createPeer(deps, options, trx),
    update: (options) => updatePeer(deps, options),
    getPage: (pagination?) => getPeersPage(deps, pagination)
  }
}

async function getPeer(
  deps: ServiceDependencies,
  id: string
): Promise<Peer | undefined> {
  return Peer.query(deps.knex).findById(id).withGraphJoined('account.asset')
}

async function createPeer(
  deps: ServiceDependencies,
  options: CreateOptions,
  trx?: Transaction
): Promise<Peer | PeerError> {
  const peerTrx = trx || (await Peer.startTransaction(deps.knex))

  try {
    const account = await deps.accountService.create(
      {
        ...options,
        asset: undefined,
        assetId: (
          await deps.assetService.getOrCreate(options.asset as AssetOptions)
        ).id
      },
      peerTrx
    )
    if (isAccountError(account)) {
      if (isPeerError(account)) {
        if (!trx) {
          await peerTrx.rollback()
        }
        return account
      }
      throw new Error('unable to create peer account, err=' + account)
    }

    const peer = await Peer.query(peerTrx)
      .insertAndFetch({
        accountId: account.id
      })
      .withGraphFetched('account.asset')
    if (!trx) {
      await peerTrx.commit()
    }
    return peer
  } catch (err) {
    if (!trx) {
      await peerTrx.rollback()
    }
    throw err
  }
}

async function updatePeer(
  deps: ServiceDependencies,
  options: UpdateOptions
): Promise<Peer | PeerError> {
  assert.ok(deps.knex, 'Knex undefined')
  return await Peer.transaction(deps.knex, async (trx) => {
    const peer = await Peer.query(trx).findById(options.id).forUpdate()
    if (!peer) {
      return PeerError.UnknownPeer
    }

    const account = await deps.accountService.update(
      {
        ...options,
        id: peer.accountId
      },
      trx
    )
    if (isAccountError(account)) {
      if (isPeerError(account)) {
        return account
      }
      throw new Error('unable to update peer account, err=' + account)
    }

    return Peer.query(trx).findById(options.id).withGraphJoined('account.asset')
  })
}

/** TODO: Base64 encode/decode the cursors
 * Buffer.from("Hello World").toString('base64')
 * Buffer.from("SGVsbG8gV29ybGQ=", 'base64').toString('ascii')
 */

/** getPeersPage
 * The pagination algorithm is based on the Relay connection specification.
 * Please read the spec before changing things:
 * https://relay.dev/graphql/connections.htm
 * @param pagination Pagination - cursors and limits.
 * @returns Peer[] An array of peers that form a page.
 */
async function getPeersPage(
  deps: ServiceDependencies,
  pagination?: Pagination
): Promise<Peer[]> {
  if (
    typeof pagination?.before === 'undefined' &&
    typeof pagination?.last === 'number'
  )
    throw new Error("Can't paginate backwards from the start.")

  const first = pagination?.first || 20
  if (first < 0 || first > 100) throw new Error('Pagination index error')
  const last = pagination?.last || 20
  if (last < 0 || last > 100) throw new Error('Pagination index error')

  /**
   * Forward pagination
   */
  if (typeof pagination?.after === 'string') {
    const peers = await Peer.query(deps.knex)
      .withGraphFetched('account.asset')
      .whereRaw(
        '("createdAt", "id") > (select "createdAt" :: TIMESTAMP, "id" from "peers" where "id" = ?)',
        [pagination.after]
      )
      .orderBy([
        { column: 'createdAt', order: 'asc' },
        { column: 'id', order: 'asc' }
      ])
      .limit(first)
    return peers
  }

  /**
   * Backward pagination
   */
  if (typeof pagination?.before === 'string') {
    const peers = await Peer.query(deps.knex)
      .withGraphFetched('account.asset')
      .whereRaw(
        '("createdAt", "id") < (select "createdAt" :: TIMESTAMP, "id" from "peers" where "id" = ?)',
        [pagination.before]
      )
      .orderBy([
        { column: 'createdAt', order: 'desc' },
        { column: 'id', order: 'desc' }
      ])
      .limit(last)
      .then((resp) => {
        return resp.reverse()
      })
    return peers
  }

  const peers = await Peer.query(deps.knex)
    .withGraphFetched('account.asset')
    .orderBy([
      { column: 'createdAt', order: 'asc' },
      { column: 'id', order: 'asc' }
    ])
    .limit(first)
  return peers
}
