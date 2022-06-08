import { TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant } from '../grant/model'
import { AccessToken } from './model'
import { ClientService, KeyInfo } from '../client/service'

export interface AccessTokenService {
  introspect(token: string): Promise<Introspection | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  clientService: ClientService
}

export interface Introspection extends Partial<Grant> {
  active: boolean
  key?: KeyInfo
}

export async function createAccessTokenService({
  logger,
  knex,
  clientService
}: ServiceDependencies): Promise<AccessTokenService> {
  const log = logger.child({
    service: 'TokenService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    knex,
    clientService
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
    const registryData = await deps.clientService.getRegistryDataByKid(
      grant.clientKeyId
    )
    const { keys } = registryData
    return { active: true, ...grant, key: { proof: 'httpsig', jwk: keys[0] } }
  }
}
