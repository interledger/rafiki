import { IlpPrepare, Errors } from 'ilp-packet'
import { RafikiContext, LoggingService, RafikiMiddleware } from '..'
const { InsufficientTimeoutError } = Errors

/**
 * Calculates a new expiry time for the prepare based on the minimum expiration and maximum hold time windows.
 * @param request The incoming prepare packet
 * @param minExpirationWindow The amount to reduce the request's expiry by in milliseconds
 * @param maxHoldWindow The maximum time window (in milliseconds) that the connector is willing to place funds on hold while waiting for the outcome of a transaction
 * @throws {InsufficientTimeoutError} Throws if the new expiry time is less than the minimum expiration time window or the prepare has already expired.
 */
function getDestinationExpiry(
  request: IlpPrepare,
  minExpirationWindow: number,
  maxHoldWindow: number,
  log: LoggingService
): Date {
  const sourceExpiryTime = request.expiresAt.getTime()

  if (sourceExpiryTime < Date.now()) {
    log.trace('incoming packet has already expired', { request })
    throw new InsufficientTimeoutError(
      'source transfer has already expired.' +
        ' sourceExpiry=' +
        request.expiresAt.toISOString() +
        ' currentTime=' +
        new Date().toISOString()
    )
  }

  const maxHoldTime = Date.now() + maxHoldWindow
  const expectedDestinationExpiryTime = sourceExpiryTime - minExpirationWindow
  const destinationExpiryTime = Math.min(
    expectedDestinationExpiryTime,
    maxHoldTime
  )

  if (destinationExpiryTime < Date.now() + minExpirationWindow) {
    log.trace('incoming packet expires too soon to complete payment', {
      request
    })
    throw new InsufficientTimeoutError(
      'source transfer expires too soon to complete payment.' +
        ' actualSourceExpiry=' +
        request.expiresAt.toISOString() +
        ' requiredSourceExpiry=' +
        new Date(Date.now() + 2 * minExpirationWindow).toISOString() +
        ' currentTime=' +
        new Date().toISOString()
    )
  }

  return new Date(destinationExpiryTime)
}

/**
 * Reduces the expiry of the prepare packet.
 *
 * // TODO: Should we reduce the expiry on the packet or just expire the packet?
 * // TODO: Maybe this should be combined with the expiry checker and the expiry timeout?
 */
export function createOutgoingReduceExpiryMiddleware(): RafikiMiddleware {
  return async (
    { services: { logger }, request: { prepare }, accounts: { outgoing } }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const { minExpirationWindow, maxHoldWindow } = outgoing
    // TODO: These values should not be undefined. The defaults should be set in the service
    prepare.expiresAt = getDestinationExpiry(
      prepare,
      minExpirationWindow || 1000,
      maxHoldWindow || 30000,
      logger
    )
    await next()
  }
}
