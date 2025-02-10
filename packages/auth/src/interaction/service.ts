import { v4 } from 'uuid'
import { Transaction, TransactionOrKnex } from 'objection'

import { IAppConfig } from '../config/app'
import { BaseService } from '../shared/baseService'
import { generateNonce } from '../shared/utils'
import {
  Interaction,
  InteractionState,
  InteractionWithGrant,
  isInteractionWithGrant
} from './model'
import { GrantService } from '../grant/service'

export interface InteractionService {
  getInteractionByGrant(grantId: string): Promise<InteractionWithGrant | void>
  getBySession(id: string, nonce: string): Promise<InteractionWithGrant | void>
  getByRef(ref: string): Promise<InteractionWithGrant | void>
  create(grantId: string, trx?: Transaction): Promise<Interaction>
  approve(id: string): Promise<Interaction | void>
  deny(id: string): Promise<Interaction | void>
}

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  knex: TransactionOrKnex
  config: IAppConfig
}

export async function createInteractionService({
  grantService,
  logger,
  knex,
  config
}: ServiceDependencies): Promise<InteractionService> {
  const log = logger.child({
    service: 'InteractionService'
  })
  const deps: ServiceDependencies = {
    grantService,
    logger: log,
    knex,
    config
  }
  return {
    getInteractionByGrant: (grantId: string) => getInteractionByGrant(grantId),
    getBySession: (id: string, nonce: string) => getBySession(id, nonce),
    getByRef: (ref: string) => getByRef(ref),
    create: (grantId: string, trx?: Transaction) => create(deps, grantId, trx),
    approve: (id: string) => approve(id),
    deny: (id: string) => deny(id)
  }
}

async function getInteractionByGrant(
  grantId: string
): Promise<InteractionWithGrant | void> {
  const interaction = await Interaction.query()
    .findOne({
      grantId
    })
    .withGraphFetched('grant')

  if (!interaction || !isInteractionWithGrant(interaction)) {
    return undefined
  }

  return interaction
}

async function create(
  deps: ServiceDependencies,
  grantId: string,
  trx?: Transaction
): Promise<Interaction> {
  const { knex, config } = deps
  const interactionTrx = trx || (await Interaction.startTransaction(knex))

  try {
    const interaction = await Interaction.query(interactionTrx).insert({
      grantId,
      ref: v4(),
      nonce: generateNonce(),
      state: InteractionState.Pending,
      expiresIn: config.interactionExpirySeconds
    })

    if (!trx) {
      await interactionTrx.commit()
    }

    return interaction
  } catch (err) {
    if (!trx) {
      await interactionTrx.rollback()
    }

    throw err
  }
}

async function getBySession(
  id: string,
  nonce: string
): Promise<InteractionWithGrant | undefined> {
  const queryBuilder = Interaction.query()
    .findById(id)
    .where('nonce', nonce)
    .withGraphFetched('grant')

  const interaction = await queryBuilder
  if (!interaction || !isInteractionWithGrant(interaction)) {
    return undefined
  }

  return interaction
}

async function getByRef(ref: string): Promise<InteractionWithGrant | void> {
  const interaction = await Interaction.query()
    .findOne({
      ref
    })
    .withGraphFetched('grant')

  if (!interaction || !isInteractionWithGrant(interaction)) {
    return undefined
  }

  return interaction
}

async function approve(id: string): Promise<Interaction | undefined> {
  return await Interaction.query().patchAndFetchById(id, {
    state: InteractionState.Approved
  })
}

async function deny(id: string): Promise<Interaction | undefined> {
  return Interaction.query().patchAndFetchById(id, {
    state: InteractionState.Denied
  })
}
