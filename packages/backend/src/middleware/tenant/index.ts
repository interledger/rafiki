import { ForTenantIdContext, TenantedApolloContext } from '../../app'

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
export function tenantIdToProceed(
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
