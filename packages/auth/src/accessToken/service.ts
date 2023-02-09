import { v4 } from 'uuid'
import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { generateToken } from '../shared/utils'
import { Grant, GrantState } from '../grant/model'
import { ClientService } from '../client/service'
import { AccessToken } from './model'
import { IAppConfig } from '../config/app'

export interface AccessTokenService {
  get(token: string): Promise<AccessToken | undefined>
  getByManagementId(managementId: string): Promise<AccessToken | undefined>
  introspect(token: string): Promise<Grant | undefined>
  revoke(id: string, tokenValue: string): Promise<void>
  create(grantId: string, opts?: AccessTokenOpts): Promise<AccessToken>
  rotate(
    managementId: string,
    tokenValue: string
  ): Promise<AccessToken | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  clientService: ClientService
  config: IAppConfig
}

interface AccessTokenOpts {
  expiresIn?: number
  trx?: Transaction
}

export async function createAccessTokenService({
  logger,
  knex,
  config,
  clientService
}: ServiceDependencies): Promise<AccessTokenService> {
  const log = logger.child({
    service: 'TokenService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    knex,
    clientService,
    config
  }

  return {
    get: (token: string) => get(token),
    getByManagementId: (managementId: string) =>
      getByManagementId(managementId),
    introspect: (token: string) => introspect(deps, token),
    revoke: (id: string, tokenValue: string) => revoke(deps, id, tokenValue),
    create: (grantId: string, opts?: AccessTokenOpts) =>
      createAccessToken(deps, grantId, opts),
    rotate: (managementId: string, tokenValue: string) =>
      rotate(deps, managementId, tokenValue)
  }
}

function isTokenExpired(token: AccessToken): boolean {
  const now = new Date(Date.now())
  const expiresAt = token.createdAt.getTime() + token.expiresIn * 1000
  return expiresAt < now.getTime()
}

async function get(token: string): Promise<AccessToken | undefined> {
  return AccessToken.query().findOne('value', token)
}

async function getByManagementId(
  managementId: string
): Promise<AccessToken | undefined> {
  return AccessToken.query()
    .findOne('managementId', managementId)
    .withGraphFetched('grant')
}

async function introspect(
  deps: ServiceDependencies,
  value: string
): Promise<Grant | undefined> {
  const token = await AccessToken.query(deps.knex)
    .findOne({ value })
    .withGraphFetched('grant.access')

  if (!token) return
  if (isTokenExpired(token)) {
    return undefined
  } else {
    if (!token.grant || token.grant.state === GrantState.Revoked) {
      return undefined
    }

    return token.grant
  }
}

async function revoke(
  deps: ServiceDependencies,
  id: string,
  tokenValue: string
): Promise<void> {
  await AccessToken.query()
    .findOne({
      managementId: id,
      value: tokenValue
    })
    .delete()
}

async function createAccessToken(
  deps: ServiceDependencies,
  grantId: string,
  opts?: AccessTokenOpts
): Promise<AccessToken> {
  return AccessToken.query(opts?.trx || deps.knex).insert({
    value: generateToken(),
    managementId: v4(),
    grantId,
    expiresIn: opts?.expiresIn || deps.config.accessTokenExpirySeconds
  })
}

async function rotate(
  deps: ServiceDependencies,
  managementId: string,
  tokenValue: string
): Promise<AccessToken | undefined> {
  return AccessToken.transaction(async (trx) => {
    const oldToken = await AccessToken.query(trx)
      .delete()
      .returning('*')
      .findOne({
        managementId,
        value: tokenValue
      })

    if (!oldToken) {
      deps.logger.warn(
        { managementId, tokenValue },
        'Could not find old token during token rotation'
      )
      return
    }

    return AccessToken.query(trx).insertAndFetch({
      value: generateToken(),
      grantId: oldToken.grantId,
      expiresIn: oldToken.expiresIn,
      managementId: v4()
    })
  })
}
