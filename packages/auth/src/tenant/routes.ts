import { ParsedUrlQuery } from 'querystring'
import { AppContext } from '../app'
import { TenantService } from './service'
import { BaseService } from '../shared/baseService'

type TenantRequest<BodyT = never, QueryT = ParsedUrlQuery> = Exclude<
  AppContext['request'],
  'body'
> & {
  body: BodyT
  query: ParsedUrlQuery & QueryT
}

type TenantContext<BodyT = never, QueryT = ParsedUrlQuery> = Exclude<
  AppContext,
  'request'
> & {
  request: TenantRequest<BodyT, QueryT>
}

interface CreateTenantBody {
  id: string
  idpConsentUrl: string
  idpSecret: string
}

type UpdateTenantBody = Partial<Omit<CreateTenantBody, 'id'>>

interface TenantParams {
  id: string
}

export type GetContext = TenantContext<never, TenantParams>
export type CreateContext = TenantContext<CreateTenantBody>
export type UpdateContext = TenantContext<UpdateTenantBody, TenantParams>
export type DeleteContext = TenantContext<never, TenantParams>

export interface TenantRoutes {
  get(ctx: GetContext): Promise<void>
  create(ctx: CreateContext): Promise<void>
  update(ctx: UpdateContext): Promise<void>
  delete(ctx: DeleteContext): Promise<void>
}

interface ServiceDependencies extends BaseService {
  tenantService: TenantService
}

export function createTenantRoutes({
  tenantService,
  logger
}: ServiceDependencies): TenantRoutes {
  const log = logger.child({
    service: 'TenantRoutes'
  })

  const deps = { tenantService, logger: log }

  return {
    get: (ctx: GetContext) => getTenant(deps, ctx),
    create: (ctx: CreateContext) => createTenant(deps, ctx),
    update: (ctx: UpdateContext) => updateTenant(deps, ctx),
    delete: (ctx: DeleteContext) => deleteTenant(deps, ctx)
  }
}

// TODO: error handling?

async function createTenant(
  deps: ServiceDependencies,
  ctx: CreateContext
): Promise<void> {
  const { body } = ctx.request
  await deps.tenantService.create(body)
  ctx.status = 201
}

async function updateTenant(
  deps: ServiceDependencies,
  ctx: UpdateContext
): Promise<void> {
  const { id } = ctx.params
  const { body } = ctx.request
  const tenant = await deps.tenantService.update(id, body)

  if (!tenant) {
    ctx.throw(404)
  }

  ctx.status = 200
}

async function deleteTenant(
  deps: ServiceDependencies,
  ctx: DeleteContext
): Promise<void> {
  const { id } = ctx.params
  const deleted = await deps.tenantService.delete(id)

  if (!deleted) {
    ctx.throw(404)
  }

  ctx.status = 204
}

async function getTenant(
  deps: ServiceDependencies,
  ctx: GetContext
): Promise<void> {
  const { id } = ctx.params
  const tenant = await deps.tenantService.get(id)

  if (!tenant) {
    ctx.throw(404)
  }

  ctx.status = 200
  ctx.body = tenant
}
