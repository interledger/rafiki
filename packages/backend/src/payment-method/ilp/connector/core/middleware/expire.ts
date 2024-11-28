import { Errors } from 'ilp-packet'
import { ILPContext } from '../rafiki'

const { TransferTimedOutError } = Errors

/**
 * This middleware should be at the end of the outgoing pipeline to ensure
 * the whole pipeline process the reject that is generated when a prepare expires
 */
export function createOutgoingExpireMiddleware() {
  return async (
    { request, services: { logger } }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    const { expiresAt, destination } = request.prepare
    const duration = expiresAt.getTime() - Date.now()

    let timeoutId
    const timeout = async (): Promise<never> =>
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new TransferTimedOutError('packet expired.'))
        }, duration)
      })

    try {
      if (duration <= 0) {
        throw new TransferTimedOutError('packet expired.')
      }
      await Promise.race([next(), timeout()])
    } catch (error) {
      if (error instanceof TransferTimedOutError) {
        logger.debug({ expiresAt, destination }, 'packet expired')
      }
      throw error
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }
}
