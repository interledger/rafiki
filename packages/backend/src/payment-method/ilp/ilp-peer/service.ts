import {
  ForeignKeyViolationError,
  UniqueViolationError,
  NotFoundError,
  raw,
  TransactionOrKnex
} from 'objection'
import { isValidIlpAddress } from 'ilp-packet'

import { IlpPeerError } from './errors'
import { IlpPeer } from './model'

import { BaseService } from '../../../shared/baseService'

export interface CreateArgs {
  peerId: string
  maxPacketAmount?: bigint
  staticIlpAddress: string
}

export interface UpdateArgs {
  id: string
  maxPacketAmount?: bigint
  staticIlpAddress?: string
}

export interface IlpPeerService {
  get(id: string): Promise<IlpPeer | undefined>
  create(options: CreateArgs): Promise<IlpPeer | IlpPeerError>
  update(options: UpdateArgs): Promise<IlpPeer | IlpPeerError>
  getByDestinationAddress(
    address: string,
    assetId?: string
  ): Promise<IlpPeer | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createIlpPeerService({
  logger,
  knex
}: ServiceDependencies): Promise<IlpPeerService> {
  const log = logger.child({
    service: 'IlpPeerService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }
  return {
    get: (id) => getIlpPeer(deps, id),
    create: (options) => create(deps, options),
    update: (options) => update(deps, options),
    getByDestinationAddress: (destinationAddress, assetId) =>
      getByDestinationAddress(deps, destinationAddress, assetId)
  }
}

async function getIlpPeer(
  deps: ServiceDependencies,
  id: string
): Promise<IlpPeer | undefined> {
  return IlpPeer.query(deps.knex).findById(id).withGraphFetched('peer.asset')
}

async function create(
  deps: ServiceDependencies,
  args: CreateArgs,
  trx?: TransactionOrKnex
): Promise<IlpPeer | IlpPeerError> {
  if (!isValidIlpAddress(args.staticIlpAddress)) {
    return IlpPeerError.InvalidStaticIlpAddress
  }

  try {
    return await IlpPeer.query(trx || deps.knex)
      .insertAndFetch({
        peerId: args.peerId,
        staticIlpAddress: args.staticIlpAddress,
        maxPacketAmount: args.maxPacketAmount
      })
      .withGraphFetched('peer.asset')
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      if (err.constraint === 'ilppeers_peerid_foreign') {
        return IlpPeerError.UnknownPeer
      }
    } else if (err instanceof UniqueViolationError) {
      return IlpPeerError.DuplicateIlpPeer
    }
    throw err
  }
}

async function update(
  deps: ServiceDependencies,
  args: UpdateArgs,
  trx?: TransactionOrKnex
): Promise<IlpPeer | IlpPeerError> {
  if (args.staticIlpAddress && !isValidIlpAddress(args.staticIlpAddress)) {
    return IlpPeerError.InvalidStaticIlpAddress
  }

  if (!deps.knex) {
    throw new Error('Knex undefined')
  }

  try {
    return await IlpPeer.query(trx || deps.knex)
      .patchAndFetchById(args.id, args)
      .withGraphFetched('peer.asset')
      .throwIfNotFound()
  } catch (err) {
    if (err instanceof NotFoundError) {
      return IlpPeerError.UnknownPeer
    }
    throw err
  }
}

async function getByDestinationAddress(
  deps: ServiceDependencies,
  destinationAddress: string,
  assetId?: string
): Promise<IlpPeer | undefined> {
  // This query does the equivalent of the following regex
  // for `staticIlpAddress`s in the accounts table:
  // new RegExp('^' + staticIlpAddress + '($|\\.)')).test(destinationAddress)
  const ilpPeerQuery = IlpPeer.query(deps.knex)
    .withGraphJoined('peer.asset')
    .where(
      raw('?', [destinationAddress]),
      'like',
      // "_" is a Postgres pattern wildcard (matching any one character), and must be escaped.
      // See: https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE
      raw("REPLACE(REPLACE(??, '_', '\\\\_'), '%', '\\\\%') || '%'", [
        'ilpPeers.staticIlpAddress'
      ])
    )
    .andWhere((builder) => {
      builder
        .where(
          raw('length(??)', ['ilpPeers.staticIlpAddress']),
          destinationAddress.length
        )
        .orWhere(
          raw('substring(?, length(??)+1, 1)', [
            destinationAddress,
            'ilpPeers.staticIlpAddress'
          ]),
          '.'
        )
    })

  if (assetId) {
    ilpPeerQuery.andWhere('peer.assetId', assetId)
  }

  return ilpPeerQuery.first()
}
