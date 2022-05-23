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
export interface GrantRequest {
  access: AccessRequest[]
  client: ClientInfo
  interact: {
    start: StartMethod[]
    finish: {
      method: FinishMethod
      uri: string
      nonce: string
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
  if (typeof grantRequest.access !== 'object') return false
  for (const access of grantRequest.access) {
    if (!isAccessRequest(access)) return false
  }

  return (
    grantRequest.interact?.start !== undefined &&
    grantRequest.interact?.finish !== undefined
  )
}

async function initiateGrant(
  deps: ServiceDependencies,
  grantRequest: GrantRequest,
  trx?: Transaction
): Promise<GrantResponse> {
  const { accessService, knex, config } = deps

  const {
    access,
    interact: {
      start,
      finish: { method: finishMethod, uri: finishUri, nonce: clientNonce }
    }
  } = grantRequest

  const grant = await Grant.query(trx || knex).insert({
    state: GrantState.Pending,
    startMethod: start,
    finishMethod,
    finishUri,
    clientNonce,
    interactId: v4(),
    interactRef: v4(),
    interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase(), // TODO: factor out nonce generation
    continueId: v4(),
    continueToken: crypto.randomBytes(8).toString('hex').toUpperCase()
  })

  // Associate provided accesses with grant
  await Promise.all(
    access.map((accessRequest) => {
      accessService.createAccess(grant.id, accessRequest, trx)
    })
  )

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
}
