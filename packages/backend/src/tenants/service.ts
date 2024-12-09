<<<<<<< HEAD
import { validate as validateUuid } from 'uuid'
import { Tenant } from './model'
import { BaseService } from '../shared/baseService'
import { TransactionOrKnex } from 'objection'
import { Pagination, SortOrder } from '../shared/baseModel'
import { CacheDataStore } from '../middleware/cache/data-stores'
import type { AuthServiceClient } from '../auth-service-client/client'
import { KeyValuePair, TenantSettingService } from './settings/service'
import { TenantSetting, TenantSettingKeys } from './settings/model'
import type { IAppConfig } from '../config/app'
import { isTenantError, TenantError } from './errors'
import { TenantSettingInput } from '../graphql/generated/graphql'

export interface TenantService {
  get: (id: string, includeDeleted?: boolean) => Promise<Tenant | undefined>
  create: (options: CreateTenantOptions) => Promise<Tenant | TenantError>
  update: (options: UpdateTenantOptions) => Promise<Tenant>
  delete: (id: string) => Promise<void>
  getPage: (pagination?: Pagination, sortOrder?: SortOrder) => Promise<Tenant[]>
  updateOperatorApiSecretFromConfig: () => Promise<undefined | TenantError>
}
export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  tenantCache: CacheDataStore<Tenant>
  authServiceClient: AuthServiceClient
  tenantSettingService: TenantSettingService
  config: IAppConfig
=======
import { Tenant } from './model'
import { BaseService } from '../shared/baseService'
import { gql, NormalizedCacheObject } from '@apollo/client'
import { ApolloClient } from '@apollo/client'
import { TransactionOrKnex } from 'objection'
import { Pagination, SortOrder } from '../shared/baseModel'
import { CacheDataStore } from '../middleware/cache/data-stores'

export interface TenantService {
  get: (id: string) => Promise<Tenant | undefined>
  create: (options: CreateTenantOptions) => Promise<Tenant>
  update: (options: UpdateTenantOptions) => Promise<Tenant>
  delete: (id: string) => Promise<void>
  getPage: (pagination?: Pagination, sortOrder?: SortOrder) => Promise<Tenant[]>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  apolloClient: ApolloClient<NormalizedCacheObject>
  tenantCache: CacheDataStore<Tenant>
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
}

export async function createTenantService(
  deps_: ServiceDependencies
): Promise<TenantService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({ service: 'TenantService' })
  }

  return {
<<<<<<< HEAD
    get: (id: string, includeDeleted?: boolean) =>
      getTenant(deps, id, includeDeleted),
=======
    get: (id: string) => getTenant(deps, id),
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
    create: (options) => createTenant(deps, options),
    update: (options) => updateTenant(deps, options),
    delete: (id) => deleteTenant(deps, id),
    getPage: (pagination, sortOrder) =>
<<<<<<< HEAD
      getTenantPage(deps, pagination, sortOrder),
    updateOperatorApiSecretFromConfig: () =>
      updateOperatorApiSecretFromConfig(deps)
=======
      getTenantPage(deps, pagination, sortOrder)
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
  }
}

async function getTenant(
  deps: ServiceDependencies,
<<<<<<< HEAD
  id: string,
  includeDeleted: boolean = false
): Promise<Tenant | undefined> {
  const inMem = await deps.tenantCache.get(id)
  if (inMem) {
    if (!includeDeleted && inMem.deletedAt) return undefined
    return inMem
  }
  let query = Tenant.query(deps.knex)
  if (!includeDeleted) query = query.whereNull('deletedAt')

  const tenant = await query.findById(id)
=======
  id: string
): Promise<Tenant | undefined> {
  const inMem = await deps.tenantCache.get(id)
  if (inMem) return inMem
  const tenant = await Tenant.query(deps.knex)
    .findById(id)
    .whereNull('deletedAt')
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
  if (tenant) await deps.tenantCache.set(tenant.id, tenant)

  return tenant
}

async function getTenantPage(
  deps: ServiceDependencies,
  pagination?: Pagination,
  sortOrder?: SortOrder
): Promise<Tenant[]> {
  return await Tenant.query(deps.knex).getPage(pagination, sortOrder)
}

interface CreateTenantOptions {
<<<<<<< HEAD
  id?: string
  email?: string
  apiSecret: string
  idpSecret?: string
  idpConsentUrl?: string
  publicName?: string
  settings?: TenantSettingInput[]
=======
  email: string
  apiSecret: string
  idpSecret: string
  idpConsentUrl: string
  publicName?: string
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
}

async function createTenant(
  deps: ServiceDependencies,
  options: CreateTenantOptions
<<<<<<< HEAD
): Promise<Tenant | TenantError> {
  const trx = await deps.knex.transaction()
  try {
    const {
      id,
      email,
      apiSecret,
      publicName,
      idpSecret,
      idpConsentUrl,
      settings
    } = options
    if (id && !validateUuid(id)) {
      throw TenantError.InvalidTenantId
    }
    const tenant = await Tenant.query(trx).insertAndFetch({
      id,
=======
): Promise<Tenant> {
  const trx = await deps.knex.transaction()
  try {
    const { email, apiSecret, publicName, idpSecret, idpConsentUrl } = options
    const tenant = await Tenant.query(trx).insertAndFetch({
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
      email,
      publicName,
      apiSecret,
      idpSecret,
      idpConsentUrl
    })

<<<<<<< HEAD
    await deps.authServiceClient.tenant.create({
      id: tenant.id,
      apiSecret,
      idpSecret,
      idpConsentUrl
    })

    const createInitialTenantSettingsOptions: {
      tenantId: string
      setting: ReturnType<typeof TenantSetting.default>
    } = {
      tenantId: tenant.id,
      setting: TenantSetting.default()
    }

    const defaultIlpAddressSetting: KeyValuePair = {
      key: TenantSettingKeys.ILP_ADDRESS.name,
      value: `${deps.config.ilpAddress}.${tenant.id}`
    }

    createInitialTenantSettingsOptions.setting.push(defaultIlpAddressSetting)

    if (
      settings &&
      !settings.find(
        (setting) => setting.key === TenantSettingKeys.ILP_ADDRESS.name
      )
    ) {
      createInitialTenantSettingsOptions.setting =
        createInitialTenantSettingsOptions.setting.concat(settings)
    } else if (settings) {
      createInitialTenantSettingsOptions.setting = settings
    }

    deps.logger.info(
      {
        createInitialTenantSettingsOptions
      },
      'initial options'
    )

    await deps.tenantSettingService.create(createInitialTenantSettingsOptions, {
      trx
    })

=======
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
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
    await trx.commit()

    await deps.tenantCache.set(tenant.id, tenant)
    return tenant
  } catch (err) {
    await trx.rollback()
<<<<<<< HEAD
    if (isTenantError(err)) return err
=======
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
    throw err
  }
}

interface UpdateTenantOptions {
  id: string
  email?: string
  publicName?: string
  apiSecret?: string
  idpConsentUrl?: string
  idpSecret?: string
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
        apiSecret,
        idpConsentUrl,
        idpSecret
      })
      .whereNull('deletedAt')
      .throwIfNotFound()

<<<<<<< HEAD
    if (idpConsentUrl || idpSecret || apiSecret) {
      await deps.authServiceClient.tenant.update(id, {
        apiSecret,
        idpConsentUrl,
        idpSecret
      })
=======
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
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
    }

    await trx.commit()
    await deps.tenantCache.set(tenant.id, tenant)
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

  await deps.tenantCache.delete(id)
  try {
    const deletedAt = new Date()
<<<<<<< HEAD

    await deps.tenantSettingService.delete(
      {
        tenantId: id
      },
      { trx, deletedAt }
    )
    await Tenant.query(trx).patchAndFetchById(id, {
      deletedAt
    })
    await deps.authServiceClient.tenant.delete(id, deletedAt)
=======
    await Tenant.query(trx).patchAndFetchById(id, {
      deletedAt
    })
    const mutation = gql`
      mutation DeleteAuthTenantMutation($input: DeleteTenantInput!) {
        deleteTenant(input: $input) {
          sucess
        }
      }
    `
    const variables = { input: { id, deletedAt } }
    // TODO: add types to this in https://github.com/interledger/rafiki/issues/3125
    await deps.apolloClient.mutate({ mutation, variables })
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
    await trx.commit()
  } catch (err) {
    await trx.rollback()
    throw err
  }
}
<<<<<<< HEAD

async function updateOperatorApiSecretFromConfig(
  deps: ServiceDependencies
): Promise<undefined | TenantError> {
  const { adminApiSecret, operatorTenantId } = deps.config

  const tenant = await Tenant.query(deps.knex)
    .findById(operatorTenantId)
    .whereNull('deletedAt')

  if (!tenant) {
    return TenantError.TenantNotFound
  }
  if (tenant.apiSecret !== adminApiSecret) {
    await tenant.$query(deps.knex).patch({ apiSecret: adminApiSecret })
    await deps.tenantCache.set(operatorTenantId, tenant)
  }
}
=======
>>>>>>> 07630c10 (feat(backend): tenants service (#3123) (#3140))
