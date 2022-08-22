import { TransactionOrKnex } from 'objection'

import { Client } from './model'
import { BaseService } from '../shared/baseService'
import { ClientKeys } from '../clientKeys/model'
import { JWKWithRequired } from 'auth'

export interface CreateClientOptions {
  name: string
  uri: string
}

export interface AddKeyToClientOptions {
  id: string
  clientId: string
  jwk: JWKWithRequired
}

export interface ClientService {
  getClient(id: string): Promise<Client | undefined>
  createClient(options: CreateClientOptions): Promise<Client>
  addKeyToClient(options: AddKeyToClientOptions): Promise<Client>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createClientService({
  logger,
  knex
}: ServiceDependencies): Promise<ClientService> {
  const log = logger.child({
    service: 'ClientKeysService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }
  return {
    getClient: (id) => getClient(deps, id),
    createClient: (options) => createClient(deps, options),
    addKeyToClient: (options) => addKeyToClient(deps, options)
  }
}

async function getClient(
  deps: ServiceDependencies,
  id: string
): Promise<Client | undefined> {
  const client = await Client.query(deps.knex).findById(id)
  client.keys = await getClientKeys(deps, client.id)
  return client
}

async function getClientKeys(
  deps: ServiceDependencies,
  clientId: string
): Promise<ClientKeys[]> {
  return ClientKeys.query(deps.knex)
    .where('clientId', clientId)
    .orderBy('createdAt', 'desc')
}

async function createClient(
  deps: ServiceDependencies,
  options: CreateClientOptions
): Promise<Client> {
  return Client.query(deps.knex).insertAndFetch(options)
}

async function addKeyToClient(
  deps: ServiceDependencies,
  options: AddKeyToClientOptions
): Promise<Client> {
  await ClientKeys.query(deps.knex).insertAndFetch(options)
  return getClient(deps, options.clientId)
}
