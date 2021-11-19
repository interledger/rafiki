import assert from 'assert'
import { NotFoundError, raw, Transaction } from 'objection'
import { isValidIlpAddress } from 'ilp-packet'

import { isPeerError, PeerError } from './errors'
import { Peer } from './model'
import { AccountingService, AccountType } from '../accounting/service'
import { AssetService, AssetOptions } from '../asset/service'
import { HttpTokenOptions, HttpTokenService } from '../httpToken/service'
import { HttpTokenError } from '../httpToken/errors'
import { BaseService } from '../shared/baseService'
import { Pagination } from '../shared/pagination'

export interface HttpOptions {
  incoming?: {
    authTokens: string[]
  }
  outgoing: {
    authToken: string
    endpoint: string
  }
}

export type Options = {
  http: HttpOptions
  maxPacketAmount?: bigint
  staticIlpAddress: string
}

export type CreateOptions = Options & {
  asset: AssetOptions
}

export type UpdateOptions = Partial<Options> & {
  id: string
}

export interface PeerService {
  get(id: string): Promise<Peer | undefined>
  create(options: CreateOptions, trx?: Transaction): Promise<Peer | PeerError>
  update(options: UpdateOptions): Promise<Peer | PeerError>
  getByDestinationAddress(address: string): Promise<Peer | undefined>
  getByIncomingToken(token: string): Promise<Peer | undefined>
  getPage(pagination?: Pagination): Promise<Peer[]>
}

interface ServiceDependencies extends BaseService {
  accountingService: AccountingService
  assetService: AssetService
  httpTokenService: HttpTokenService
}

export async function createPeerService({
  logger,
  knex,
  accountingService,
  assetService,
  httpTokenService
}: ServiceDependencies): Promise<PeerService> {
  const log = logger.child({
    service: 'PeerService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    accountingService,
    assetService,
    httpTokenService
  }
  return {
    get: (id) => getPeer(deps, id),
    create: (options, trx) => createPeer(deps, options, trx),
    update: (options) => updatePeer(deps, options),
    getByDestinationAddress: (destinationAddress) =>
      getPeerByDestinationAddress(deps, destinationAddress),
    getByIncomingToken: (token) => getPeerByIncomingToken(deps, token),
    getPage: (pagination?) => getPeersPage(deps, pagination)
  }
}

async function getPeer(
  deps: ServiceDependencies,
  id: string
): Promise<Peer | undefined> {
  return Peer.query(deps.knex).findById(id).withGraphJoined('asset')
}

async function createPeer(
  deps: ServiceDependencies,
  options: CreateOptions,
  trx?: Transaction
): Promise<Peer | PeerError> {
  if (!isValidIlpAddress(options.staticIlpAddress)) {
    return PeerError.InvalidStaticIlpAddress
  }

  const peerTrx = trx || (await Peer.startTransaction(deps.knex))

  try {
    const asset = await deps.assetService.getOrCreate(
      options.asset as AssetOptions
    )

    const peer = await Peer.query(peerTrx)
      .insertAndFetch({
        assetId: asset.id,
        http: options.http,
        maxPacketAmount: options.maxPacketAmount,
        staticIlpAddress: options.staticIlpAddress
      })
      .withGraphFetched('asset')

    if (options.http?.incoming) {
      const err = await addIncomingHttpTokens({
        deps,
        peerId: peer.id,
        tokens: options.http?.incoming?.authTokens,
        trx: peerTrx
      })
      if (err) {
        if (!trx) {
          await peerTrx.rollback()
        }
        return err
      }
    }

    await deps.accountingService.createAccount({
      id: peer.id,
      asset,
      type: AccountType.Credit
    })

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
  if (
    options.staticIlpAddress &&
    !isValidIlpAddress(options.staticIlpAddress)
  ) {
    return PeerError.InvalidStaticIlpAddress
  }

  assert.ok(deps.knex, 'Knex undefined')
  try {
    return await Peer.transaction(deps.knex, async (trx) => {
      if (options.http?.incoming) {
        await deps.httpTokenService.deleteByPeer(options.id, trx)
        const err = await addIncomingHttpTokens({
          deps,
          peerId: options.id,
          tokens: options.http?.incoming?.authTokens,
          trx
        })
        if (err) {
          await trx.rollback(err)
        }
      }
      return await Peer.query(trx)
        .patchAndFetchById(options.id, options)
        .withGraphFetched('asset')
        .throwIfNotFound()
    })
  } catch (err) {
    if (err instanceof NotFoundError) {
      return PeerError.UnknownPeer
    } else if (isPeerError(err)) {
      return err
    }
    throw err
  }
}

async function addIncomingHttpTokens({
  deps,
  peerId,
  tokens,
  trx
}: {
  deps: ServiceDependencies
  peerId: string
  tokens: string[]
  trx: Transaction
}): Promise<void | PeerError> {
  const incomingTokens = tokens.map(
    (token: string): HttpTokenOptions => {
      return {
        peerId,
        token
      }
    }
  )

  const err = await deps.httpTokenService.create(incomingTokens, trx)
  if (err) {
    if (err === HttpTokenError.DuplicateToken) {
      return PeerError.DuplicateIncomingToken
    }
    throw new Error(err)
  }
}

async function getPeerByDestinationAddress(
  deps: ServiceDependencies,
  destinationAddress: string
): Promise<Peer | undefined> {
  // This query does the equivalent of the following regex
  // for `staticIlpAddress`s in the accounts table:
  // new RegExp('^' + staticIlpAddress + '($|\\.)')).test(destinationAddress)
  const peer = await Peer.query(deps.knex)
    .withGraphJoined('asset')
    .where(
      raw('?', [destinationAddress]),
      'like',
      // "_" is a Postgres pattern wildcard (matching any one character), and must be escaped.
      // See: https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE
      raw("REPLACE(REPLACE(??, '_', '\\\\_'), '%', '\\\\%') || '%'", [
        'staticIlpAddress'
      ])
    )
    .andWhere((builder) => {
      builder
        .where(
          raw('length(??)', ['staticIlpAddress']),
          destinationAddress.length
        )
        .orWhere(
          raw('substring(?, length(??)+1, 1)', [
            destinationAddress,
            'staticIlpAddress'
          ]),
          '.'
        )
    })
    .first()
  return peer || undefined
}

async function getPeerByIncomingToken(
  deps: ServiceDependencies,
  token: string
): Promise<Peer | undefined> {
  const httpToken = await deps.httpTokenService.get(token)
  if (httpToken) {
    return httpToken.peer
  }
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
      .withGraphFetched('asset')
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
      .withGraphFetched('asset')
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
    .withGraphFetched('asset')
    .orderBy([
      { column: 'createdAt', order: 'asc' },
      { column: 'id', order: 'asc' }
    ])
    .limit(first)
  return peers
}
