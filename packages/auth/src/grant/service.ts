import { v4 } from 'uuid'
import * as crypto from 'crypto'
import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant, GrantState, StartMethod, FinishMethod } from './model'
import { AccessRequest } from '../access/types'
import { ClientInfo } from '../client/service'
import { AccessService } from '../access/service'
import { AccessTokenService } from '../accessToken/service'
import { AccessToken } from '../accessToken/model'
import { IAppConfig } from '../config/app'

export interface GrantService {
  initiateGrant(grantRequest: GrantRequest): Promise<Grant>
  getByInteraction(interactId: string): Promise<Grant>
  issueGrant(grantId: string): Promise<{ grant: Grant, accessToken: AccessToken }>
}

interface ServiceDependencies extends BaseService {
  accessService: AccessService
  accessTokenService: AccessTokenService
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
  accessTokenService,
  config,
  knex
}: ServiceDependencies): Promise<GrantService> {
  const log = logger.child({
    service: 'GrantService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    accessService,
    accessTokenService,
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
): Promise<{ grant: Grant; accessToken: AccessToken }> {
  // TODO: create access token, update grant state
  const invTrx = trx || (await Grant.startTransaction())
  try {
    const accessToken = await deps.accessTokenService.create(grantId, {
      trx: invTrx
    })
    const grant = await Grant.query(invTrx).patchAndFetchById(grantId, {
      state: GrantState.Granted
    })

    if (!trx) {
      await invTrx.commit()
    }
    return { accessToken, grant }
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
): Promise<Grant> {
  const { accessService, knex } = deps

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

    return grant
  } catch (err) {
    if (!trx) {
      await invTrx.rollback()
    }

    throw err
  }
}

async function getByInteraction(interactId: string): Promise<Grant> {
  return Grant.query().findOne({ interactId })
}
