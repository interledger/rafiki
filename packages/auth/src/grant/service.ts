import * as crypto from 'crypto'
import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant, GrantState, StartMethod, FinishMethod } from './model'
import { AccessRequest } from './types'
import { ClientInfo } from '../client/service'
import { IAppConfig } from '../config/app'
import { LimitService } from '../limit/service'

export interface GrantService {
  // validateGrantRequest(grantRequest: unknown): boolean
  initiateGrant(grantRequest: GrantRequest): Promise<GrantResponse>
}

interface ServiceDependencies extends BaseService {
  limitService: LimitService
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
  limitService,
  config,
  knex
}: ServiceDependencies): Promise<GrantService> {
  const log = logger.child({
    service: 'GrantService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    limitService,
    config,
    knex
  }
  return {
    // validateGrantRequest: (grantRequest: unknown) => validateGrantRequest(grantRequest),
    initiateGrant: (grantRequest: GrantRequest, trx?: Transaction) =>
      initiateGrant(deps, grantRequest, trx)
  }
}

async function initiateGrant(
  deps: ServiceDependencies,
  grantRequest: GrantRequest,
  trx?: Transaction
): Promise<GrantResponse> {
  const { limitService, knex, config } = deps

  const {
    access,
    interact: {
      start,
      finish: { method: finishMethod, uri: finishUri, nonce: clientNonce }
    }
  } = grantRequest

  const grant = await Grant.query(trx || knex).insert({
    state: GrantState.Pending,
    ...grantRequest.access,
    startMethod: start,
    finishMethod,
    finishUri,
    clientNonce,
    interactId: crypto.randomBytes(8).toString('hex').toUpperCase(), // TODO: maybe replace this & interactRef with uuid/v4
    interactRef: crypto.randomBytes(8).toString('hex').toUpperCase(),
    interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
  })

  // Associate provided limits with grant
  await Promise.all(
    access.map((accessRequest) => {
      const { limits } = accessRequest
      if (limits) {
        limitService.createLimit(grant.id, limits, trx)
      }
    })
  )

  return {
    interact: {
      redirect: config.domain + `/interact/${grant.interactId}`,
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
