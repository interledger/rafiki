import { AccessType, AccessAction } from './grant'
import { HttpSigContext, verifySigAndChallenge } from 'auth'

export function createAuthMiddleware({
  type,
  action
}: {
  type: AccessType
  action: AccessAction
}) {
  return async (
    ctx: HttpSigContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const config = await ctx.container.use('config')
    const grantReferenceService = await ctx.container.use(
      'grantReferenceService'
    )
    const logger = await ctx.container.use('logger')
    try {
      const parts = ctx.request.headers.authorization?.split(' ')
      if (parts?.length !== 2 || parts[0] !== 'GNAP') {
        ctx.throw(401, 'Unauthorized')
      }
      const token = parts[1]
      if (
        process.env.NODE_ENV !== 'production' &&
        token === config.devAccessToken
      ) {
        await next()
        return
      }
      const authService = await ctx.container.use('authService')
      const grant = await authService.introspect(token)
      if (!grant || !grant.active) {
        ctx.throw(401, 'Invalid Token')
      }
      const access = grant.findAccess({
        type,
        action,
        identifier: ctx.paymentPointer.url
      })
      if (!access) {
        ctx.throw(403, 'Insufficient Grant')
      }
      if (!config.bypassSignatureValidation) {
        try {
          if (!(await verifySigAndChallenge(grant.key.jwk, ctx))) {
            ctx.throw(401, 'Invalid signature')
          }
        } catch (e) {
          ctx.status = 401
          ctx.throw(401, `Invalid signature`)
        }
      }

      try {
        await grantReferenceService.getOrCreate(
          { id: grant.grant, clientId: grant.clientId },
          action
        )
      } catch (e) {
        const errInfo = e && typeof e === 'object' && e.stack ? e.stack : e
        logger.debug(errInfo)
        ctx.throw(500)
      }

      ctx.grant = grant

      // Unless the relevant grant action is ReadAll/ListAll add the
      // clientId to ctx for Read/List filtering
      if (access.actions.includes(action)) {
        ctx.clientId = grant.clientId
      }

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
