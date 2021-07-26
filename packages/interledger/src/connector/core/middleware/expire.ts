import { Errors } from 'ilp-packet'
import { RafikiContext } from '../rafiki'

const { TransferTimedOutError } = Errors

/**
 * This middleware should be at the end of the outgoing pipeline to ensure
 * the whole pipeline process the reject that is generated when a prepare expires
 */
export function createOutgoingExpireMiddleware() {
  return async (
    { request, services: { logger } }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const { expiresAt } = request.prepare
    const duration = expiresAt.getTime() - Date.now()
    const timeout = setTimeout(() => {
      logger.debug('packet expired', { request })
      throw new TransferTimedOutError('packet expired.')
    }, duration)

    await next().catch((error) => {
      clearTimeout(timeout)
      throw error
    })

    clearTimeout(timeout)
  }
}
