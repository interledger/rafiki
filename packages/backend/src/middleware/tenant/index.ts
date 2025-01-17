import { ForTenantIdContext } from '../../app'
import { tenantIdToProceed } from '../../shared/utils'

type Request = () => Promise<unknown>

interface TenantValidateMiddlewareArgs {
  deps: { context: ForTenantIdContext }
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
    context.forTenantId = context.tenant.id
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
  context.forTenantId = forTenantId
  return next()
}
