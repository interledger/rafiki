import { HttpToken } from './model'
import { BaseService } from '../shared/baseService'
import {
  ForeignKeyViolationError,
  Transaction,
  UniqueViolationError
} from 'objection'

export interface HttpTokenOptions {
  token: string
  accountId: string
}

export enum HttpTokenError {
  DuplicateToken = 'DuplicateToken',
  UnknownAccount = 'UnknownAccount'
}

export interface HttpTokenService {
  create(
    tokens: HttpTokenOptions[],
    trx?: Transaction
  ): Promise<void | HttpTokenError>
  deleteByAccount(accountId: string, trx?: Transaction): Promise<void>
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
    deleteByAccount: (accountId, trx) =>
      deleteHttpTokensByAccount(deps, accountId, trx)
  }
}

async function createHttpTokens(
  deps: ServiceDependencies,
  tokens: HttpTokenOptions[],
  trx?: Transaction
): Promise<void | HttpTokenError> {
  try {
    await HttpToken.query(trx).insert(tokens)
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      return HttpTokenError.UnknownAccount
    } else if (err instanceof UniqueViolationError) {
      return HttpTokenError.DuplicateToken
    }
    throw err
  }
}

async function deleteHttpTokensByAccount(
  deps: ServiceDependencies,
  accountId: string,
  trx?: Transaction
): Promise<void> {
  await HttpToken.query(trx).delete().where({
    accountId
  })
}
