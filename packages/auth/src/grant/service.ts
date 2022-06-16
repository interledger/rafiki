import { v4 } from 'uuid'
import * as crypto from 'crypto'
import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant, GrantState, StartMethod, FinishMethod } from './model'
import { AccessRequest } from '../access/types'
import { ClientInfo } from '../client/service'
import { IAppConfig } from '../config/app'
import { AccessService } from '../access/service'

export interface GrantService {
  initiateGrant(grantRequest: GrantRequest): Promise<GrantResponse>
  getByInteraction(interactId: string): Promise<Grant>
  issueGrant(grantId: string): Promise<Grant>
}

interface ServiceDependencies extends BaseService {
  accessService: AccessService
  config: IAppConfig
  knex: TransactionOrKnex
}

// datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-2
export interface GrantRequest {
  access_token: {
    access: AccessRequest[]
  }
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
    wait: number
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
    initiateGrant: (grantRequest: GrantRequest, trx?: Transaction) =>
      initiateGrant(deps, grantRequest, trx),
    getByInteraction: (interactId: string) => getByInteraction(interactId),
    issueGrant: (grantId: string) => issueGrant(deps, grantId)
  }
}

async function issueGrant(
  deps: ServiceDependencies,
  grantId: string,
  trx?: Transaction
): Promise<Grant> {
  const invTrx = trx || (await Grant.startTransaction())
  try {
    const grant = await Grant.query(invTrx).patchAndFetchById(grantId, {
      state: GrantState.Granted
    })

    if (!trx) {
      await invTrx.commit()
    }
    return grant
  } catch (err) {
    if (!trx) {
      await invTrx.rollback()
    }

    throw err
  }
}

async function initiateGrant(
  deps: ServiceDependencies,
  grantRequest: GrantRequest,
  trx?: Transaction
): Promise<GrantResponse> {
  const { accessService, knex, config } = deps

  const {
    access_token: { access },
    interact: { start, finish },
    client: {
      key: {
        jwk: { kid }
      }
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
      clientKeyId: kid,
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
        redirect: config.resourceServerDomain + `/interact/${grant.interactId}`,
        finish: grant.interactNonce
      },
      continue: {
        access_token: {
          value: grant.continueToken
        },
        uri: config.authServerDomain + `/auth/continue/${grant.continueId}`,
        wait: config.waitTimeSeconds
      }
    }
  } catch (err) {
    if (!trx) {
      await invTrx.rollback()
    }

    throw err
  }
}

async function getByInteraction(interactId: string): Promise<Grant> {
  return Grant.query().where({ interactId }).first()
}
