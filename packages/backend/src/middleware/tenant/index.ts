import { ForTenantIdContext, TenantedApolloContext } from '../../app'
import { tenantIdToProceed } from '../../shared/utils'

type Request = () => Promise<unknown>

interface TenantValidateMiddlewareArgs {
  deps: { context: TenantedApolloContext }
  tenantIdInput: string | undefined
  onFailValidation: Request
  next: Request
}

export async function validateTenantMiddleware(
  args: TenantValidateMiddlewareArgs
): ReturnType<Request> {
  const {
    deps: { context },
    tenantIdInput,
    onFailValidation,
    next
  } = args
  if (!tenantIdInput) {
    ;(context as ForTenantIdContext).forTenantId = context.tenant.id
    return next()
  }

  const forTenantId = tenantIdToProceed(
    context.isOperator,
    context.tenant.id,
    tenantIdInput
  )
  if (!forTenantId) {
    context.logger.error('Tenant validation error')
    return onFailValidation()
  }

  ;(context as ForTenantIdContext).forTenantId = forTenantId
  return next()
}
