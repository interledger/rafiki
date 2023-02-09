import { v4 } from 'uuid'
import { TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { generateToken } from '../shared/utils'
import { Grant, GrantState } from '../grant/model'
import { ClientService } from '../client/service'
import { AccessToken } from './model'
import { IAppConfig } from '../config/app'

interface RotateTokenArgs {
  id: string
  grantId: string
  expiresIn?: number
}

interface CreateTokenArgs {
  grantId: string
  expiresIn?: number
}

export interface AccessTokenService {
  get(tokenValue: string): Promise<AccessToken | undefined>
  getByManagementId(managementId: string): Promise<AccessToken | undefined>
  introspect(tokenValue: string): Promise<Grant | undefined>
  create(args: CreateTokenArgs, trx?: TransactionOrKnex): Promise<AccessToken>
  revoke(id: string, trx?: TransactionOrKnex): Promise<boolean>
  rotate(
    args: RotateTokenArgs,
    trx?: TransactionOrKnex
  ): Promise<AccessToken | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  clientService: ClientService
  config: IAppConfig
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
    get: (tokenValue: string) => get(tokenValue),
    getByManagementId: (managementId: string) =>
      getByManagementId(managementId),
    introspect: (tokenValue: string) => introspect(deps, tokenValue),
    revoke: (id: string, trx?: TransactionOrKnex) => revoke(deps, id, trx),
    create: (args: CreateTokenArgs, trx?: TransactionOrKnex) =>
      createAccessToken(deps, args, trx),
    rotate: (args: RotateTokenArgs) => rotate(deps, args)
  }
}

function isTokenExpired(token: AccessToken): boolean {
  const now = new Date(Date.now())
  const expiresAt = token.createdAt.getTime() + token.expiresIn * 1000
  return expiresAt < now.getTime()
}

async function get(tokenValue: string): Promise<AccessToken | undefined> {
  return AccessToken.query().findOne('value', tokenValue)
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
  tokenValue: string
): Promise<Grant | undefined> {
  const token = await AccessToken.query(deps.knex)
    .findOne({ value: tokenValue })
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
  trx?: TransactionOrKnex
): Promise<boolean> {
  const deletedCount = await AccessToken.query(trx || deps.knex)
    .findById(id)
    .delete()

  return deletedCount === 1
}

async function createAccessToken(
  deps: ServiceDependencies,
  args: CreateTokenArgs,
  trx?: TransactionOrKnex
): Promise<AccessToken> {
  const { grantId, expiresIn } = args
  return AccessToken.query(trx || deps.knex).insert({
    value: generateToken(),
    managementId: v4(),
    grantId,
    expiresIn: expiresIn ?? deps.config.accessTokenExpirySeconds
  })
}

async function rotate(
  deps: ServiceDependencies,
  args: RotateTokenArgs,
  trx?: TransactionOrKnex
): Promise<AccessToken | undefined> {
  const { id, grantId, expiresIn } = args

  const isRevoked = await revoke(deps, id, trx)

  if (!isRevoked) {
    deps.logger.warn({ tokenId: id, grantId }, 'Could not revoke access token')
    return undefined
  }

  return createAccessToken(deps, { grantId, expiresIn }, trx)
}
