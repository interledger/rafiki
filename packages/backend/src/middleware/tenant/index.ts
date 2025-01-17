import { ApolloContext, TenantedApolloContext } from '../../app'
import { tenantIdToProceed } from '../../shared/utils'

type Request = () => Promise<unknown>

interface TenantValidateMiddlewareArgs {
  deps: { ctx: ApolloContext }
  tenantIdInput: string | undefined
  onFailValidation: Request
  next: Request
}

export async function validateTenantMiddleware(
  args: TenantValidateMiddlewareArgs
): ReturnType<Request> {
  const {
    deps: { ctx },
    tenantIdInput,
    onFailValidation,
    next
  } = args
  if (!('tenant' in ctx && 'isOperator' in ctx)) return next()

  const tenantCtx = ctx as TenantedApolloContext
  if (!tenantIdInput) {
    tenantCtx.forTenantId = tenantCtx.tenant.id
    return next()
  }

  const forTenantId = tenantIdToProceed(
    tenantCtx.isOperator,
    tenantCtx.tenant.id,
    tenantIdInput
  )
  if (!forTenantId) {
    ctx.logger.error('Tenant validation error')
    return onFailValidation()
  }

  tenantCtx.forTenantId = forTenantId
  return next()
}
