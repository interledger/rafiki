import { v4 } from 'uuid'
import * as crypto from 'crypto'
import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Grant, GrantState, StartMethod, FinishMethod } from './model'
import { AccessRequest } from '../access/types'
import { ClientInfo } from '../client/service'
import { AccessService } from '../access/service'

export interface GrantService {
  get(grantId: string): Promise<Grant>
  initiateGrant(grantRequest: GrantRequest): Promise<Grant>
  getByInteraction(interactId: string): Promise<Grant>
  issueGrant(grantId: string): Promise<Grant>
  getByContinue(
    continueId: string,
    continueToken: string,
    interactRef: string
  ): Promise<Grant | null>
  denyGrant(grantId: string): Promise<Grant | null>
}

interface ServiceDependencies extends BaseService {
  accessService: AccessService
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
  knex
}: ServiceDependencies): Promise<GrantService> {
  const log = logger.child({
    service: 'GrantService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    accessService,
    knex
  }
  return {
    get: (grantId: string) => get(grantId),
    initiateGrant: (grantRequest: GrantRequest, trx?: Transaction) =>
      initiateGrant(deps, grantRequest, trx),
    getByInteraction: (interactId: string) => getByInteraction(interactId),
    issueGrant: (grantId: string) => issueGrant(deps, grantId),
    getByContinue: (
      continueId: string,
      continueToken: string,
      interactRef: string
    ) => getByContinue(continueId, continueToken, interactRef),
    denyGrant: (grantId: string) => denyGrant(deps, grantId)
  }
}

async function get(grantId: string): Promise<Grant> {
  return Grant.query().findById(grantId)
}

async function issueGrant(
  deps: ServiceDependencies,
  grantId: string
): Promise<Grant> {
  return Grant.query().patchAndFetchById(grantId, {
    state: GrantState.Granted
  })
}

async function denyGrant(
  deps: ServiceDependencies,
  grantId: string
): Promise<Grant | null> {
  return Grant.query(deps.knex).patchAndFetchById(grantId, {
    state: GrantState.Denied
  })
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

  const grantTrx = trx || (await Grant.startTransaction(knex))
  try {
    const grant = await Grant.query(grantTrx).insert({
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
    await accessService.createAccess(grant.id, access, grantTrx)

    if (!trx) {
      await grantTrx.commit()
    }

    return grant
  } catch (err) {
    if (!trx) {
      await grantTrx.rollback()
    }

    throw err
  }
}

async function getByInteraction(interactId: string): Promise<Grant> {
  return Grant.query().findOne({ interactId })
}

async function getByContinue(
  continueId: string,
  continueToken: string,
  interactRef: string
): Promise<Grant | null> {
  const grant = await Grant.query().findOne({ interactRef })
  if (
    continueId !== grant?.continueId ||
    continueToken !== grant?.continueToken
  )
    return null
  return grant
}
