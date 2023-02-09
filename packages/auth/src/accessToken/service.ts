import { v4 } from 'uuid'
import { TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { generateToken } from '../shared/utils'
import { Grant, GrantState } from '../grant/model'
import { ClientService } from '../client/service'
import { AccessToken } from './model'
import { IAppConfig } from '../config/app'

interface RevokeTokenArgs {
  managementId: string
  tokenValue: string
  trx?: TransactionOrKnex
}

interface RotateTokenArgs {
  grantId: string
  managementId: string
  tokenValue: string
  expiresIn?: number
  trx?: TransactionOrKnex
}

export interface AccessTokenService {
  get(token: string): Promise<AccessToken | undefined>
  getByManagementId(managementId: string): Promise<AccessToken | undefined>
  introspect(token: string): Promise<Grant | undefined>
  revoke(args: RevokeTokenArgs): Promise<boolean>
  create(grantId: string, opts?: AccessTokenOpts): Promise<AccessToken>
  rotate(args: RotateTokenArgs): Promise<AccessToken | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  clientService: ClientService
  config: IAppConfig
}

interface AccessTokenOpts {
  expiresIn?: number
  trx?: TransactionOrKnex
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
    revoke: (args: RevokeTokenArgs) => revoke(deps, args),
    create: (grantId: string, opts?: AccessTokenOpts) =>
      createAccessToken(deps, grantId, opts),
    rotate: (args: RotateTokenArgs) => rotate(deps, args)
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
  args: RevokeTokenArgs
): Promise<boolean> {
  const { managementId, tokenValue, trx } = args
  const deletedCount = await AccessToken.query(trx || deps.knex)
    .findOne({
      managementId,
      value: tokenValue
    })
    .delete()

  return deletedCount === 1
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
  args: RotateTokenArgs
): Promise<AccessToken | undefined> {
  const { managementId, tokenValue, grantId, expiresIn, trx } = args

  const isRevoked = await revoke(deps, args)

  if (!isRevoked) {
    deps.logger.warn(
      { managementId, tokenValue, grantId },
      'Could not revoke access token'
    )
    return undefined
  }

  return createAccessToken(deps, grantId, { trx, expiresIn })
}
