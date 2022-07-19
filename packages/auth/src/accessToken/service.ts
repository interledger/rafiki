import { TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant, GrantState } from '../grant/model'
import { AccessToken } from './model'
import { ClientService, KeyInfo } from '../client/service'
import { Access } from '../access/model'
import { v4 as uuid } from 'uuid'
import * as crypto from 'crypto'

export interface AccessTokenService {
  introspect(token: string): Promise<Introspection | undefined>
  revoke(id: string): Promise<void>
  rotate(managementId: string): Promise<Rotation>
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
      access: Array<Access>
      value: string
      managementId: string
      expiresIn?: number
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
    rotate: (managementId: string) => rotate(deps, managementId)
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

async function revoke(deps: ServiceDependencies, id: string): Promise<void> {
  const token = await AccessToken.query(deps.knex).findById(id)
  if (token) {
    await token.$query(deps.knex).delete()
  }
}

async function rotate(
  deps: ServiceDependencies,
  managementId: string
): Promise<Rotation> {
  let token = await AccessToken.query(deps.knex).findOne({ managementId })
  if (token) {
    await token.$query(deps.knex).delete()
    token = await AccessToken.query(deps.knex).insertAndFetch({
      value: crypto.randomBytes(8).toString('hex').toUpperCase(),
      grantId: token.grantId,
      expiresIn: token.expiresIn,
      managementId: uuid()
    })
    const access = await Access.query(deps.knex).where({
      grantId: token.grantId
    })
    return {
      success: true,
      access,
      value: token.value,
      managementId: token.managementId,
      expiresIn: token.expiresIn
    }
  } else {
    return {
      success: false,
      error: new Error('token not found')
    }
  }
}
