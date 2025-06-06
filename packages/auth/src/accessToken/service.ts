import { v4 } from 'uuid'
import { TransactionOrKnex } from 'objection'
import { AccessItem } from '@interledger/open-payments'

import { BaseService } from '../shared/baseService'
import { generateToken } from '../shared/utils'
import { Grant, isRevokedGrant } from '../grant/model'
import { ClientService } from '../client/service'
import { AccessToken } from './model'
import { compareRequestAndGrantAccessItems } from '../access/utils'
import { Access, toOpenPaymentsAccess } from '../access/model'

export interface AccessTokenService {
  getByManagementId(managementId: string): Promise<AccessToken | undefined>
  introspect(
    tokenValue: string,
    access?: AccessItem[]
  ): Promise<{ grant: Grant; access: Access[] } | undefined>
  create(grantId: string, trx?: TransactionOrKnex): Promise<AccessToken>
  revoke(id: string, trx?: TransactionOrKnex): Promise<AccessToken | undefined>
  revokeByGrantId(grantId: string, trx?: TransactionOrKnex): Promise<number>
  rotate(id: string, trx?: TransactionOrKnex): Promise<AccessToken | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  clientService: ClientService
  accessTokenExpirySeconds: number
}

export async function createAccessTokenService({
  logger,
  knex,
  clientService,
  accessTokenExpirySeconds
}: ServiceDependencies): Promise<AccessTokenService> {
  const log = logger.child({
    service: 'TokenService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    knex,
    clientService,
    accessTokenExpirySeconds
  }

  return {
    getByManagementId: (managementId: string) =>
      getByManagementId(managementId),
    introspect: (tokenValue: string, access?: AccessItem[]) =>
      introspect(deps, tokenValue, access),
    revoke: (id: string, trx?: TransactionOrKnex) => revoke(deps, id, trx),
    revokeByGrantId: (grantId: string, trx?: TransactionOrKnex) =>
      revokeByGrantId(deps, grantId, trx),
    create: (grantId: string, trx?: TransactionOrKnex) =>
      createAccessToken(deps, grantId, trx),
    rotate: (id: string) => rotate(deps, id)
  }
}

function isTokenExpired(token: AccessToken): boolean {
  const now = new Date(Date.now())
  const expiresAt = token.createdAt.getTime() + token.expiresIn * 1000
  return expiresAt < now.getTime()
}

async function getByManagementId(
  managementId: string
): Promise<AccessToken | undefined> {
  return AccessToken.query()
    .findOne('managementId', managementId)
    .whereNull('revokedAt')
    .withGraphFetched('grant')
}

async function introspect(
  deps: ServiceDependencies,
  tokenValue: string,
  access?: AccessItem[]
): Promise<{ grant: Grant; access: Access[] } | undefined> {
  const token = await AccessToken.query(deps.knex)
    .findOne({ value: tokenValue })
    .whereNull('revokedAt')
    .withGraphFetched('grant.access')

  if (!token) return
  if (isTokenExpired(token)) return
  if (!token.grant || isRevokedGrant(token.grant)) return

  const foundAccess: Access[] = []

  if (access) {
    for (const accessItem of access) {
      const { access: grantAccess } = token.grant
      const foundAccessItem = grantAccess?.find((grantAccessItem) =>
        compareRequestAndGrantAccessItems(
          accessItem,
          toOpenPaymentsAccess(grantAccessItem)
        )
      )
      if (foundAccessItem) {
        foundAccess.push(foundAccessItem)
      }
    }
  }

  return { grant: token.grant, access: foundAccess }
}

async function revoke(
  deps: ServiceDependencies,
  id: string,
  trx?: TransactionOrKnex
): Promise<AccessToken | undefined> {
  return AccessToken.query(trx || deps.knex)
    .patchAndFetchById(id, {
      revokedAt: new Date()
    })
    .whereNull('revokedAt')
    .returning('*')
    .first()
}

async function revokeByGrantId(
  deps: ServiceDependencies,
  grantId: string,
  trx?: TransactionOrKnex
): Promise<number> {
  return await AccessToken.query(trx || deps.knex)
    .patch({
      revokedAt: new Date()
    })
    .where('grantId', grantId)
}
async function createAccessToken(
  deps: ServiceDependencies,
  grantId: string,
  trx?: TransactionOrKnex
): Promise<AccessToken> {
  return AccessToken.query(trx || deps.knex).insert({
    value: generateToken(),
    managementId: v4(),
    grantId,
    expiresIn: deps.accessTokenExpirySeconds
  })
}

async function rotate(
  deps: ServiceDependencies,
  id: string,
  trx?: TransactionOrKnex
): Promise<AccessToken | undefined> {
  const revokedToken = await revoke(deps, id, trx)

  if (!revokedToken) {
    deps.logger.warn({ tokenId: id }, 'Could not revoke access token')
    return undefined
  }

  return createAccessToken(deps, revokedToken.grantId, trx)
}
