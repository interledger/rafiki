import { TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant } from '../grant/model'
import { AccessToken } from './model'

export interface AccessTokenService {
  introspect(token: string): Promise<Introspection | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

interface Introspection extends Partial<Grant> {
  active: boolean
}

export async function createAccessTokenService({
  logger,
  knex
}: ServiceDependencies): Promise<AccessTokenService> {
  const log = logger.child({
    service: 'TokenService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    knex
  }

  return {
    introspect: (token: string) => introspect(deps, token)
  }
}

async function introspect(
  deps: ServiceDependencies,
  value: string
): Promise<Introspection | undefined> {
  const token = await AccessToken.query(deps.knex).findOne({ value })
  if (!token) return
  const now = new Date(Date.now())
  const expiresAt = token.expiresIn
    ? token.createdAt.getTime() + token.expiresIn
    : Infinity
  if (expiresAt < now.getTime()) {
    return { active: false }
  } else {
    const grant = await Grant.query(deps.knex)
      .findById(token.grantId)
      .withGraphFetched('access')
    return { active: true, ...grant }
  }
}
