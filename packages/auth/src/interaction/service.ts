import { v4 } from 'uuid'
import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { generateNonce } from '../shared/utils'
import { Interaction, InteractionState } from './model'

export interface InteractionService {
  getPendingInteractionByGrant(grantId: string): Promise<Interaction | void>
  create(grantId: string): Promise<Interaction>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createInteractionService({
  logger,
  knex
}: ServiceDependencies): Promise<InteractionService> {
  const log = logger.child({
    service: 'InteractionService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }
  return {
    getPendingInteractionByGrant: (grantId: string) => getPendingInteractionByGrant(grantId),
    create: (grantId: string) => create(deps, grantId)
  }
}

async function getPendingInteractionByGrant(
  grantId: string
): Promise<Interaction | void> {
  return Interaction.query().findOne({
    grantId,
    state: InteractionState.Pending
  })
}

async function create(
  deps: ServiceDependencies,
  grantId: string,
  trx?: Transaction
): Promise<Interaction> {
  const interactionTrx = trx || (await Interaction.startTransaction(deps.knex))

  // TODO: commit if trx was not passed in
  return Interaction.query(interactionTrx).insert({
    grantId,
    ref: v4(),
    nonce: generateNonce(),
    state: InteractionState.Pending
  })
}

async function acceptInteraction(
  deps: ServiceDependencies,
  id: string,
  trx?: Transaction
): Promise<Interaction | void> {
  const interactionTrx = trx || (await Interaction.startTransaction(deps.knex))
  const interaction = await Interaction.query().findById(id)
  if (!interaction || interaction.state !== InteractionState.Pending) {
    // TODO: throw correct error
    return
  }

  // TODO: commit if trx was not passed in
  return Interaction.query(interactionTrx).patchAndFetchById(id, {
    state: InteractionState.Accepted
  })
}

async function rejectInteraction(
  deps: ServiceDependencies,
  id: string,
  trx?: Transaction
): Promise<Interaction | void> {
  const interactionTrx = trx || (await Interaction.startTransaction(deps.knex))
  const interaction = await Interaction.query().findById(id)
  if (!interaction || interaction.state !== InteractionState.Pending) {
    // TODO: throw correct error
    return
  }

  // TODO: commit if trx was not passed to
  return Interaction.query(interactionTrx).patchAndFetchById(id, {
    state: InteractionState.Rejected
  })
}
