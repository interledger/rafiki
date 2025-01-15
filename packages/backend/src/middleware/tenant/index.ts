import { ApolloContext, TenantedApolloContext } from '../../app'

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

/**
 * The tenantId to use will be determined as follows:
 * - When an operator and the {tenantId} is present, return {tenantId}
 * - When an operator and {tenantId} is not present, return {signatureTenantId}
 * - When NOT an operator and {tenantId} is present, but does not match {signatureTenantId}, return {undefined}
 * - Otherwise return {signatureTenantId}
 *
 * @param isOperator is operator
 * @param signatureTenantId the signature tenantId
 * @param tenantId the intended tenantId
 */
function tenantIdToProceed(
  isOperator: boolean,
  signatureTenantId: string,
  tenantId?: string
): string | undefined {
  if (isOperator && tenantId) return tenantId
  else if (isOperator) return signatureTenantId
  return tenantId && tenantId !== signatureTenantId
    ? undefined
    : signatureTenantId
}
