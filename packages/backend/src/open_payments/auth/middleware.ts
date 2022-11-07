import { AccessType, AccessAction } from './grant'
import { PaymentPointerContext } from '../../app'
import { Transaction } from 'objection'
import { GrantReference } from '../grantReference/model'

export function createAuthMiddleware({
  type,
  action
}: {
  type: AccessType
  action: AccessAction
}) {
  return async (
    ctx: PaymentPointerContext,
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
      await GrantReference.transaction(async (trx: Transaction) => {
        const grantRef = await grantReferenceService.get(grant.grant, trx)
        if (grantRef) {
          if (grantRef.clientId !== grant.clientId) {
            logger.debug(
              `clientID ${grant.clientId} for grant ${grant.grant} does not match internal reference clientId ${grantRef.clientId}.`
            )
            ctx.throw(500)
          }
        } else if (action === AccessAction.Create) {
          // Grant and client ID's are only stored for create routes
          await grantReferenceService.create(
            {
              id: grant.grant,
              clientId: grant.clientId
            },
            trx
          )
        }
      })
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
