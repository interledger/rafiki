import { Transaction, UniqueViolationError } from 'objection'

import { BaseService } from '../shared/baseService'
import { IlpHttpToken } from './model'

export interface Token {
  token: string
  accountId: string
}

export enum TokenError {
  DuplicateToken = 'DuplicateToken'
}

export interface TokenService {
  create(tokens: Token[], trx?: Transaction): Promise<void | TokenError>
  delete(accountId: string, trx?: Transaction): Promise<void>
}

type ServiceDependencies = BaseService

export function createTokenService({
  logger
}: ServiceDependencies): TokenService {
  const log = logger.child({
    service: 'TokenService'
  })
  const deps: ServiceDependencies = {
    logger: log
  }
  return {
    create: (tokens, trx) => createTokens(deps, tokens, trx),
    delete: (accountId, trx) => deleteTokens(deps, accountId, trx)
  }
}

async function createTokens(
  deps: ServiceDependencies,
  tokens: Token[],
  trx?: Transaction
): Promise<void | TokenError> {
  try {
    await IlpHttpToken.query(trx).insert(tokens)
  } catch (err) {
    if (
      err instanceof UniqueViolationError &&
      err.constraint === 'ilphttptokens_token_unique'
    ) {
      return TokenError.DuplicateToken
    }
    throw err
  }
}

async function deleteTokens(
  deps: ServiceDependencies,
  accountId: string,
  trx?: Transaction
): Promise<void> {
  await IlpHttpToken.query(trx).delete().where({
    accountId
  })
}
