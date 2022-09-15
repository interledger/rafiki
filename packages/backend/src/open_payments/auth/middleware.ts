import { AccessType, AccessAction } from './grant'
import { AppContext } from '../../app'
import { GrantReference } from '../grantReference/model'

export function createAuthMiddleware({
  type,
  action
}: {
  type: AccessType
  action: AccessAction
}) {
  return async (
    ctx: AppContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const config = await ctx.container.use('config')
    try {
      const parts = ctx.request.headers.authorization?.split(' ')
      if (parts?.length !== 2 || parts[0] !== 'GNAP') {
        ctx.throw(401, 'Unauthorized')
      }
      const token = parts[1]
      const authService = await ctx.container.use('authService')
      const grant = await authService.introspect(token)
      if (!grant || !grant.active) {
        ctx.throw(401, 'Invalid Token')
      }
      if (
        !grant.includesAccess({
          type,
          action,
          identifier: ctx.paymentPointer.url
        })
      ) {
        ctx.throw(403, 'Insufficient Grant')
      }
      const grantRef = await GrantReference.query().findById(grant.grant)
      if (grantRef) {
        if (grantRef.clientId !== grant.clientId) {
          ctx.throw(409, 'Unknown Client ID')
        }
      } else {
        await GrantReference.query().insert({
          id: grant.grant,
          clientId: grant.clientId
        })
      }
      ctx.grant = grant
      await next()
    } catch (err) {
      if (err.status === 401) {
        ctx.status = 401
        ctx.message = err.message
        ctx.set('WWW-Authenticate', `GNAP as_uri=${config.authServerGrantUrl}`)
      } else {
        throw err
      }
    }
  }
}
