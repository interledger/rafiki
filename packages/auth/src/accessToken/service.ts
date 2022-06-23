import { TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant, GrantState } from '../grant/model'
import { AccessToken } from './model'
import { ClientService, KeyInfo } from '../client/service'
import { Access } from '../access/model'
import { v4 as uuid } from 'uuid'

export interface AccessTokenService {
  introspect(token: string): Promise<Introspection | undefined>
  revoke(id: string): Promise<Error | undefined>
  rotate(id: string): Promise<Rotation>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  clientService: ClientService
}

export interface Introspection extends Partial<Grant> {
  active: boolean
  key?: KeyInfo
}

export type Rotation =
  | {
      success: true
      access: Access
    }
  | {
      success: false
      error: Error
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
    revoke: (id: string) => revoke(deps, id),
    rotate: (id: string) => rotate(deps, id)
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
): Promise<Error | undefined> {
  const token = await AccessToken.query(deps.knex).findById(id)
  if (token) {
    if (!token.revoked && !isTokenExpired(token)) {
      await token.$query(deps.knex).patch({ revoked: true })
    }
  } else {
    return new Error('token not found')
  }
}

async function rotate(
  deps: ServiceDependencies,
  id: string
): Promise<Rotation> {
  let access: Access | undefined
  let error: Error | undefined

  const token = await AccessToken.query(deps.knex).findById(id)
  if (token) {
    if (token.revoked) {
      error = new Error('token revoked')
    } else {
      await token.$query(deps.knex).patch({
        value: uuid()
      })
      access = await Access.query(deps.knex).findOne({ grantId: token.grantId })
    }
  } else {
    error = new Error('token not found')
  }

  if (access) {
    return {
      success: true,
      access
    }
  } else {
    return {
      success: false,
      error: error || new Error('token rotation failed')
    }
  }
}
