import { Tenant, TenantWithIdpConfig } from './model'
import { BaseService } from '../shared/baseService'
import { gql, NormalizedCacheObject } from '@apollo/client'
import { ApolloClient } from '@apollo/client'
import { TransactionOrKnex } from 'objection'

export interface TenantService {
  get: (id: string) => Promise<TenantWithIdpConfig | undefined>
  create: (options: CreateTenantOptions) => Promise<Tenant>
  update: (options: UpdateTenantOptions) => Promise<Tenant>
  delete: (id: string) => Promise<void>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  apolloClient: ApolloClient<NormalizedCacheObject>
}

export async function createTenantService(
  deps_: ServiceDependencies
): Promise<TenantService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({ service: 'TenantService' })
  }

  return {
    get: (id: string) => getTenant(deps, id),
    create: (options) => createTenant(deps, options),
    update: (options) => updateTenant(deps, options),
    delete: (id) => deleteTenant(deps, id)
  }
}

async function getTenant(
  deps: ServiceDependencies,
  id: string
): Promise<TenantWithIdpConfig | undefined> {
  const tenant = await Tenant.query(deps.knex).findById(id)
  if (!tenant) return undefined

  const query = gql`
    query GetAuthTenant($input: GetTenantInput!) {
      getTenant(input: $input) {
        tenant {
          id
          idpConsentUrl
          idpSecret
        }
      }
    }
  `
  const variables = { input: { id } }
  // TODO: add type to this in https://github.com/interledger/rafiki/issues/3125
  const authTenantResponse = await deps.apolloClient.query({ query, variables })
  const authTenant = authTenantResponse.data.getTenant.tenant
  if (!authTenant) {
    deps.logger.error(
      { tenantId: id },
      'could not find auth tenant entry for existing backend entry'
    )
    return undefined
  }

  const { idpConsentUrl, idpSecret } = authTenant
  return {
    ...tenant,
    idpConsentUrl,
    idpSecret
  }
}

interface CreateTenantOptions {
  email: string
  apiSecret: string
  idpSecret: string
  idpConsentUrl: string
  publicName?: string
}

async function createTenant(
  deps: ServiceDependencies,
  options: CreateTenantOptions
): Promise<Tenant> {
  const trx = await deps.knex.transaction()
  try {
    const { email, apiSecret, publicName, idpSecret, idpConsentUrl } = options
    const tenant = await Tenant.query(trx).insertAndFetch({
      email,
      publicName,
      apiSecret
    })

    const mutation = gql`
      mutation CreateAuthTenant($input: CreateTenantInput!) {
        createTenant(input: $input) {
          tenant {
            id
          }
        }
      }
    `

    const variables = {
      input: {
        id: tenant.id,
        idpSecret,
        idpConsentUrl
      }
    }

    // TODO: add type to this in https://github.com/interledger/rafiki/issues/3125
    await deps.apolloClient.mutate({ mutation, variables })
    await trx.commit()
    return tenant
  } catch (err) {
    await trx.rollback()
    throw err
  }
}

interface UpdateTenantOptions {
  id: string
  email?: string
  publicName?: string
  apiSecret?: string
  idpConsentUrl: string | null
  idpSecret: string | null
}

async function updateTenant(
  deps: ServiceDependencies,
  options: UpdateTenantOptions
): Promise<Tenant> {
  const trx = await deps.knex.transaction()

  try {
    const { id, apiSecret, email, publicName, idpConsentUrl, idpSecret } =
      options
    const tenant = await Tenant.query(trx)
      .patchAndFetchById(options.id, {
        email,
        publicName,
        apiSecret
      })
      .throwIfNotFound()

    if (idpConsentUrl || idpSecret) {
      const mutation = gql`
        mutation UpdateAuthTenant($input: UpdateTenantInput!) {
          updateTenant(input: $input) {
            tenant {
              id
            }
          }
        }
      `

      const variables = {
        input: {
          id,
          idpConsentUrl,
          idpSecret
        }
      }

      // TODO: add types to this in https://github.com/interledger/rafiki/issues/3125
      await deps.apolloClient.mutate({ mutation, variables })
    }

    await trx.commit()
    return tenant
  } catch (err) {
    await trx.rollback()
    throw err
  }
}

async function deleteTenant(
  deps: ServiceDependencies,
  id: string
): Promise<void> {
  const trx = await deps.knex.transaction()

  try {
    await Tenant.query(trx).deleteById(id)
    const mutation = gql`
      mutation DeleteAuthTenantMutation($input: DeleteTenantInput!) {
        deleteTenant(input: $input) {
          sucess
        }
      }
    `
    const variables = { input: { id } }
    // TODO: add types to this in https://github.com/interledger/rafiki/issues/3125
    await deps.apolloClient.mutate({ mutation, variables })
    await trx.commit()
  } catch (err) {
    await trx.rollback()
    throw err
  }
}
