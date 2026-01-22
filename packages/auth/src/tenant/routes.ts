import { ParsedUrlQuery } from 'querystring'
import { AppContext } from '../app'
import { TenantService } from './service'
import { BaseService } from '../shared/baseService'
import { isValidDateString } from '../shared/utils'

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
  apiSecret: string
  idpConsentUrl?: string
  idpSecret?: string
}

type UpdateTenantBody = Partial<Omit<CreateTenantBody, 'id'>>

interface TenantParams {
  id: string
}

export type CreateContext = TenantContext<CreateTenantBody>
export type UpdateContext = TenantContext<UpdateTenantBody, TenantParams>
export type DeleteContext = TenantContext<{ deletedAt: string }, TenantParams>

export interface TenantRoutes {
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
    create: (ctx: CreateContext) => createTenant(deps, ctx),
    update: (ctx: UpdateContext) => updateTenant(deps, ctx),
    delete: (ctx: DeleteContext) => deleteTenant(deps, ctx)
  }
}

async function createTenant(
  deps: ServiceDependencies,
  ctx: CreateContext
): Promise<void> {
  const { body } = ctx.request

  await deps.tenantService.create(body)

  ctx.status = 204
}

async function updateTenant(
  deps: ServiceDependencies,
  ctx: UpdateContext
): Promise<void> {
  const { id } = ctx.params
  const { body } = ctx.request
  const tenant = await deps.tenantService.update(id, body)

  if (!tenant) {
    ctx.status = 404
    return
  }

  ctx.status = 204
}

async function deleteTenant(
  deps: ServiceDependencies,
  ctx: DeleteContext
): Promise<void> {
  const { id } = ctx.params
  const { deletedAt: deletedAtString } = ctx.request.body

  if (!isValidDateString(deletedAtString)) {
    ctx.status = 400
    return
  }
  const deletedAt = new Date(deletedAtString)

  const deleted = await deps.tenantService.delete(id, deletedAt)

  if (!deleted) {
    ctx.status = 404
    return
  }

  ctx.status = 204
}
