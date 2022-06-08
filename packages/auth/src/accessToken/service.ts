import * as crypto from 'crypto'
import { v4 } from 'uuid'
import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant, GrantState } from '../grant/model'
import { ClientService, KeyInfo } from '../client/service'
import { AccessToken } from './model'

export interface AccessTokenService {
  introspect(token: string): Promise<Introspection | undefined>
  revoke(id: string): Promise<Error | undefined>
  create(grantId: string, opts: AccessTokenOpts): Promise<AccessToken>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  clientService: ClientService
}

export interface Introspection extends Partial<Grant> {
  active: boolean
  key?: KeyInfo
}

interface AccessTokenOpts {
  expiresIn?: number
  trx?: Transaction
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
    create: (grantId: string, opts?: AccessTokenOpts) =>
      createAccessToken(deps, grantId, opts)
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
    if (!isTokenExpired(token)) {
      await token.$query(deps.knex).patch({ expiresIn: 1 })
    }
  } else {
    return new Error('token not found')
  }
}

async function createAccessToken(
  deps: ServiceDependencies,
  grantId: string,
  opts?: AccessTokenOpts
): Promise<AccessToken> {
  const invTrx = opts?.trx || (await AccessToken.startTransaction(deps.knex))
  try {
    const accessToken = await AccessToken.query(invTrx).insert({
      value: crypto.randomBytes(8).toString('hex').toUpperCase(), // TODO: factor out nonce generation
      managementId: v4(),
      grantId,
      expiresIn: opts?.expiresIn
    })

    if (!opts?.trx) {
      await invTrx.commit()
    }

    return accessToken
  } catch (err) {
    if (!opts?.trx) {
      await invTrx.rollback()
    }

    throw err
  }
}
