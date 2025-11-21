import {
  ForeignKeyViolationError,
  UniqueViolationError,
  NotFoundError,
  raw,
  Transaction,
  TransactionOrKnex
} from 'objection'
import { isValidIlpAddress } from 'ilp-packet'

import { isPeerError, PeerError } from './errors'
import { Peer } from './model'
import {
  AccountingService,
  LiquidityAccountType
} from '../../../accounting/service'
import { AssetService } from '../../../asset/service'
import { HttpTokenOptions, HttpTokenService } from '../peer-http-token/service'
import { HttpTokenError } from '../peer-http-token/errors'
import { Pagination, SortOrder } from '../../../shared/baseModel'
import { BaseService } from '../../../shared/baseService'
import { isValidHttpUrl } from '../../../shared/utils'
import { v4 as uuid } from 'uuid'
import { TransferError } from '../../../accounting/errors'
import PrefixMap from '../connector/ilp-routing/lib/prefix-map'

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
  name?: string
  liquidityThreshold?: bigint
  initialLiquidity?: bigint
}

export type CreateOptions = Options & {
  assetId: string
  tenantId?: string
}

export type UpdateOptions = Partial<Options> & {
  id: string
  tenantId?: string
}

interface DepositPeerLiquidityArgs {
  amount: bigint
  transferId?: string
  peerId: string
  tenantId?: string
}

export interface PeerService {
  get(id: string, tenantId?: string): Promise<Peer | undefined>
  create(options: CreateOptions): Promise<Peer | PeerError>
  update(options: UpdateOptions): Promise<Peer | PeerError>
  getByDestinationAddress(
    address: string,
    tenantId: string,
    assetId?: string
  ): Promise<Peer | undefined>
  getByIncomingToken(token: string): Promise<Peer | undefined>
  getPage(
    pagination?: Pagination,
    sortOrder?: SortOrder,
    tenantId?: string
  ): Promise<Peer[]>
  depositLiquidity(
    args: DepositPeerLiquidityArgs
  ): Promise<void | PeerError.UnknownPeer | TransferError>
  delete(id: string, tenantId: string): Promise<Peer | undefined>
}

interface ServiceDependencies extends BaseService {
  accountingService: AccountingService
  assetService: AssetService
  httpTokenService: HttpTokenService
  knex: TransactionOrKnex
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
    get: (id, tenantId) => getPeer(deps, id, tenantId),
    create: (options) => createPeer(deps, options),
    update: (options) => updatePeer(deps, options),
    getByDestinationAddress: (destinationAddress, tenantId, assetId) =>
      getPeerByDestinationAddress(deps, destinationAddress, tenantId, assetId),
    getByIncomingToken: (token) => getPeerByIncomingToken(deps, token),
    getPage: (pagination?, sortOrder?, tenantId?) =>
      getPeersPage(deps, pagination, sortOrder, tenantId),
    depositLiquidity: (args) => depositLiquidityById(deps, args),
    delete: (id, tenantId) => deletePeer(deps, id, tenantId)
  }
}

async function getPeer(
  deps: ServiceDependencies,
  id: string,
  tenantId?: string
): Promise<Peer | undefined> {
  let query = Peer.query(deps.knex)
  if (tenantId) {
    query = query.where('tenantId', tenantId)
  }
  const peer = await query.findOne({ id })
  if (peer) {
    const asset = await deps.assetService.get(peer.assetId)
    if (asset) peer.asset = asset
  }
  return peer
}

async function createPeer(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<Peer | PeerError> {
  if (!isValidIlpAddress(options.staticIlpAddress)) {
    return PeerError.InvalidStaticIlpAddress
  }

  if (!isValidHttpUrl(options.http.outgoing.endpoint)) {
    return PeerError.InvalidHTTPEndpoint
  }

  const asset = await deps.assetService.get(options.assetId, options.tenantId)
  if (!asset) {
    return PeerError.UnknownAsset
  }

  try {
    return await Peer.transaction(deps.knex, async (trx) => {
      const peer = await Peer.query(trx).insertAndFetch({
        assetId: options.assetId,
        http: options.http,
        maxPacketAmount: options.maxPacketAmount,
        staticIlpAddress: options.staticIlpAddress,
        name: options.name,
        liquidityThreshold: options.liquidityThreshold,
        tenantId: asset.tenantId
      })
      peer.asset = asset

      if (options.http?.incoming) {
        const err = await addIncomingHttpTokens({
          deps,
          peerId: peer.id,
          tokens: options.http?.incoming?.authTokens,
          trx
        })
        if (err) {
          throw err
        }
      }

      await deps.accountingService.createLiquidityAccount(
        {
          id: peer.id,
          asset: peer.asset
        },
        LiquidityAccountType.PEER,
        trx
      )

      if (options.initialLiquidity) {
        const transferError = await depositLiquidity(
          deps,
          { peer, amount: options.initialLiquidity },
          trx
        )

        if (transferError) {
          deps.logger.error(
            { err: transferError },
            'error trying to deposit initial liquidity'
          )

          throw PeerError.InvalidInitialLiquidity
        }
      }

      return peer
    })
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      if (err.constraint === 'peers_assetid_foreign') {
        return PeerError.UnknownAsset
      }
    } else if (err instanceof UniqueViolationError) {
      return PeerError.DuplicatePeer
    } else if (isPeerError(err)) {
      return err
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

  if (
    options.http?.outgoing.endpoint &&
    !isValidHttpUrl(options.http.outgoing.endpoint)
  ) {
    return PeerError.InvalidHTTPEndpoint
  }

  if (!deps.knex) {
    throw new Error('Knex undefined')
  }

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
          throw err
        }
      }

      const peer = await Peer.query(trx)
        .patchAndFetchById(options.id, options)
        .throwIfNotFound()
      const asset = await deps.assetService.get(peer.assetId)
      if (asset) peer.asset = asset
      return peer
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

async function depositLiquidityById(
  deps: ServiceDependencies,
  args: DepositPeerLiquidityArgs
): Promise<void | PeerError.UnknownPeer | TransferError> {
  const { peerId, amount, transferId, tenantId } = args

  const peer = await getPeer(deps, peerId, tenantId)
  if (!peer) {
    return PeerError.UnknownPeer
  }

  return depositLiquidity(deps, { peer, amount, transferId })
}

async function depositLiquidity(
  deps: ServiceDependencies,
  args: { peer: Peer; amount: bigint; transferId?: string },
  trx?: TransactionOrKnex
): Promise<void | TransferError> {
  const { peer, amount, transferId } = args

  return deps.accountingService.createDeposit(
    {
      id: transferId ?? uuid(),
      account: peer,
      amount
    },
    trx
  )
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
  const incomingTokens = tokens.map((token: string): HttpTokenOptions => {
    return {
      peerId,
      token
    }
  })

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
  destinationAddress: string,
  tenantId?: string,
  assetId?: string
): Promise<Peer | undefined> {
  // This query does the equivalent of the following regex
  // for `staticIlpAddress`s in the accounts table:
  // new RegExp('^' + staticIlpAddress + '($|\\.)')).test(destinationAddress)
  const peerQuery = Peer.query(deps.knex)
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

  if (assetId) {
    peerQuery.andWhere('assetId', assetId)
  }

  if (tenantId) {
    peerQuery.andWhere('tenantId', tenantId)
  }

  const peers = await peerQuery
  const peer = getByLongestPrefixMatch(peers, destinationAddress)

  if (peer) {
    const asset = await deps.assetService.get(peer.assetId)
    if (asset) peer.asset = asset
  }
  return peer || undefined
}

function getByLongestPrefixMatch(
  peers: Peer[],
  destinationAddress: string
): Peer | undefined {
  const map = new PrefixMap<Peer>()
  for (const peer of peers) {
    map.insert(peer.staticIlpAddress, peer)
  }

  return map.resolve(destinationAddress)
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
  pagination?: Pagination,
  sortOrder?: SortOrder,
  tenantId?: string
): Promise<Peer[]> {
  let query = Peer.query(deps.knex)
  if (tenantId) {
    query = query.where('tenantId', tenantId)
  }

  const peers = await query.getPage(pagination, sortOrder)
  for (const peer of peers) {
    const asset = await deps.assetService.get(peer.assetId)
    if (asset) peer.asset = asset
  }
  return peers
}

async function deletePeer(
  deps: ServiceDependencies,
  id: string,
  tenantId: string
): Promise<Peer | undefined> {
  const peer = await Peer.query(deps.knex)
    .delete()
    .where('id', id)
    .andWhere('tenantId', tenantId)
    .returning('*')
    .first()
  if (peer) {
    const asset = await deps.assetService.get(peer.assetId)
    if (asset) peer.asset = asset
  }
  return peer
}
