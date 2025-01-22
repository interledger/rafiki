import { ForTenantIdContext, TenantedApolloContext } from '../../app'
import { tenantIdToProceed } from '../../shared/utils'

type Request = () => Promise<unknown>

interface TenantValidateMiddlewareArgs {
  deps: { context: TenantedApolloContext }
  tenantIdInput: string | undefined
  next: Request
}

export async function validateTenantMiddleware(
  args: TenantValidateMiddlewareArgs
): ReturnType<Request> {
  const {
    deps: { context },
    tenantIdInput,
    next
  } = args
  ;(context as ForTenantIdContext).forTenantId = tenantIdToProceed(
    context.isOperator,
    context.tenant.id,
    tenantIdInput
  )
  return next()
}
