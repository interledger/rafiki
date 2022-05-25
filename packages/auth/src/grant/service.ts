import { v4 } from 'uuid'
import * as crypto from 'crypto'
import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant, GrantState, StartMethod, FinishMethod } from './model'
import { AccessRequest, isAccessRequest } from '../access/types'
import { ClientInfo } from '../client/service'
import { IAppConfig } from '../config/app'
import { AccessService } from '../access/service'

export interface GrantService {
  validateGrantRequest(grantRequest: GrantRequest): boolean
  initiateGrant(grantRequest: GrantRequest): Promise<GrantResponse>
}

interface ServiceDependencies extends BaseService {
  accessService: AccessService
  config: IAppConfig
  knex: TransactionOrKnex
}

// TODO: maybe update docs.openpayments.guide with location
// datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-2
export interface GrantRequest {
  access_token: {
    access: AccessRequest[]
    client: ClientInfo
    interact: {
      start: StartMethod[]
      finish?: {
        method: FinishMethod
        uri: string
        nonce: string
      }
    }
  }
}

export interface GrantResponse {
  interact: {
    redirect: string
    finish: string
  }
  continue: {
    access_token: {
      value: string
    }
    uri: string
  }
}

export async function createGrantService({
  logger,
  accessService,
  config,
  knex
}: ServiceDependencies): Promise<GrantService> {
  const log = logger.child({
    service: 'GrantService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    accessService,
    config,
    knex
  }
  return {
    validateGrantRequest: (grantRequest: GrantRequest) =>
      validateGrantRequest(grantRequest),
    initiateGrant: (grantRequest: GrantRequest, trx?: Transaction) =>
      initiateGrant(deps, grantRequest, trx)
  }
}

function validateGrantRequest(
  grantRequest: GrantRequest
): grantRequest is GrantRequest {
  if (typeof grantRequest.access_token !== 'object') return false
  const { access_token } = grantRequest
  if (typeof access_token.access !== 'object') return false
  for (const access of access_token.access) {
    if (!isAccessRequest(access)) return false
  }

  return access_token.interact?.start !== undefined
}

async function initiateGrant(
  deps: ServiceDependencies,
  grantRequest: GrantRequest,
  trx?: Transaction
): Promise<GrantResponse> {
  const { accessService, knex, config } = deps

  const {
    access_token: {
      access,
      interact: { start, finish }
    }
  } = grantRequest

  const invTrx = trx || (await Grant.startTransaction(knex))
  try {
    const grant = await Grant.query(invTrx).insert({
      state: GrantState.Pending,
      startMethod: start,
      finishMethod: finish?.method,
      finishUri: finish?.uri,
      clientNonce: finish?.nonce,
      interactId: v4(),
      interactRef: v4(),
      interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase(), // TODO: factor out nonce generation
      continueId: v4(),
      continueToken: crypto.randomBytes(8).toString('hex').toUpperCase()
    })

    // Associate provided accesses with grant
    await accessService.createAccess(grant.id, access, invTrx)

    if (!trx) {
      await invTrx.commit()
    }

    return {
      interact: {
        redirect: config.interactDomain + `/interact/${grant.interactId}`,
        finish: grant.interactNonce
      },
      continue: {
        access_token: {
          value: grant.continueToken
        },
        uri: config.domain + `/auth/continue/${grant.continueId}`
      }
    }
  } catch (err) {
    if (!trx) {
      await invTrx.commit()
    }

    throw err
  }
}
