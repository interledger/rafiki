import { TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant, GrantState } from '../grant/model'
import { AccessToken } from './model'
import { ClientService, KeyInfo } from '../client/service'

export interface AccessTokenService {
  introspect(token: string): Promise<Introspection | undefined>
  revoke(id: string): Promise<RevocationResult>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  clientService: ClientService
}

export interface Introspection extends Partial<Grant> {
  active: boolean
  key?: KeyInfo
}

export interface RevocationResult {
  foundToken: boolean
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
    introspect: (token: string) => introspect(deps, token),
    revoke: (id: string) => revoke(deps, id)
  }
}

function isTokenExpired(token: AccessToken): boolean {
  const now = new Date(Date.now())
  const expiresAt = token.expiresIn
    ? token.createdAt.getTime() + token.expiresIn
    : Infinity
  return expiresAt < now.getTime()
}

async function introspect(
  deps: ServiceDependencies,
  value: string
): Promise<Introspection | undefined> {
  const token = await AccessToken.query(deps.knex).findOne({ value })
  if (!token) return
  if (isTokenExpired(token)) {
    return { active: false }
  } else {
    const grant = await Grant.query(deps.knex)
      .findById(token.grantId)
      .withGraphFetched('access')
    if (grant.state === GrantState.Revoked) {
      return { active: false }
    }
    const registryData = await deps.clientService.getRegistryDataByKid(
      grant.clientKeyId
    )
    const { keys } = registryData
    return { active: true, ...grant, key: { proof: 'httpsig', jwk: keys[0] } }
  }
}

async function revoke(
  deps: ServiceDependencies,
  id: string
): Promise<RevocationResult> {
  const token = await AccessToken.query(deps.knex).findOne({ id })
  if (token) {
    if (!isTokenExpired(token)) {
      AccessToken.query(deps.knex)
        .update({
          expiresIn: 1
        })
        .where('id', token.id)
    }

    return {
      foundToken: true
    }
  } else {
    return {
      foundToken: false
    }
  }
}
