import { AccessType, AccessAction } from './grant'
import { PaymentPointerContext } from '../../app'
import { Transaction } from 'objection'
import { GrantReference } from '../grantReference/model'
import { verifySig } from 'auth'

function stringifyHeader(header: string | Array<string>): string {
  return Array.isArray(header) ? header.join(' ') : header
}

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
      const tokenInfo = await authService.introspect(token)
      if (!tokenInfo || !tokenInfo.active) {
        ctx.throw(401, 'Invalid Token')
      }
      if (
        !tokenInfo.includesAccess({
          type,
          action,
          identifier: ctx.paymentPointer.url
        })
      ) {
        ctx.throw(403, 'Insufficient Grant')
      }
      try {
        const sig = stringifyHeader(ctx.headers['signature'])
        const sigInput = stringifyHeader(ctx.headers['signature-input'])
        const successfullyVerified = await verifySig(
          sig.match(/:([^:]+):/)[1],
          tokenInfo.key.jwk,
          sigInput
        )
        if (!successfullyVerified) {
          ctx.throw(401, 'Invalid signature')
        }
      } catch (e) {
        ctx.status = 401
        ctx.throw(401, `Invalid signature: ${e.message}`)
      }
      await GrantReference.transaction(async (trx: Transaction) => {
        const grantRef = await grantReferenceService.get(tokenInfo.grant, trx)
        if (grantRef) {
          if (grantRef.clientId !== tokenInfo.clientId) {
            logger.debug(
              `clientID ${tokenInfo.clientId} for grant ${tokenInfo.grant} does not match internal reference clientId ${grantRef.clientId}.`
            )
            ctx.throw(500)
          }
        } else {
          await grantReferenceService.create(
            {
              id: tokenInfo.grant,
              clientId: tokenInfo.clientId
            },
            trx
          )
        }
      })
      ctx.grant = tokenInfo
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
