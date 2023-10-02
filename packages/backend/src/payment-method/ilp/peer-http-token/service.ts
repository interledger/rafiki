import { HttpTokenError } from './errors'
import { HttpToken } from './model'
import { BaseService } from '../../../shared/baseService'
import {
  ForeignKeyViolationError,
  Transaction,
  UniqueViolationError
} from 'objection'

export interface HttpTokenOptions {
  token: string
  peerId: string
}

export interface HttpTokenService {
  create(
    tokens: HttpTokenOptions[],
    trx?: Transaction
  ): Promise<void | HttpTokenError>
  deleteByPeer(peerId: string, trx?: Transaction): Promise<void>
  get(token: string): Promise<HttpToken | undefined>
}

type ServiceDependencies = BaseService

export async function createHttpTokenService({
  logger,
  knex
}: ServiceDependencies): Promise<HttpTokenService> {
  const log = logger.child({
    service: 'HttpTokenService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }
  return {
    create: (tokens, trx) => createHttpTokens(deps, tokens, trx),
    deleteByPeer: (peerId, trx) => deleteHttpTokensByPeer(deps, peerId, trx),
    get: (token) => getHttpToken(deps, token)
  }
}

async function createHttpTokens(
  deps: ServiceDependencies,
  tokens: HttpTokenOptions[],
  trx?: Transaction
): Promise<void | HttpTokenError> {
  try {
    await HttpToken.query(trx || deps.knex).insert(tokens)
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      return HttpTokenError.UnknownPeer
    } else if (err instanceof UniqueViolationError) {
      return HttpTokenError.DuplicateToken
    }
    throw err
  }
}

async function deleteHttpTokensByPeer(
  deps: ServiceDependencies,
  peerId: string,
  trx?: Transaction
): Promise<void> {
  await HttpToken.query(trx || deps.knex)
    .delete()
    .where({
      peerId
    })
}

async function getHttpToken(
  deps: ServiceDependencies,
  token: string
): Promise<HttpToken | undefined> {
  return await HttpToken.query(deps.knex)
    .findOne({
      token
    })
    .withGraphFetched('peer.asset')
}
