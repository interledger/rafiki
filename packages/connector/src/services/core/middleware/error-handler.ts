import { errorToIlpReject } from 'ilp-packet'
import { SELF_PEER_ID } from '../constants'
import { RafikiContext } from '../rafiki'

/**
 * Catch errors that bubble back along the pipeline and convert to an ILP Reject
 *
 * Important rule! It ensures any errors thrown through the middleware pipe is converted to correct ILP
 * reject that is sent back to sender.
 */
export function createIncomingErrorHandlerMiddleware(serverAddress: string) {
  return async (
    { response, services: { logger } }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    try {
      await next()
      if (!response.rawReply) {
        logger.error('handler did not return a valid value.')
        throw new Error('handler did not return a value.')
      }
    } catch (e) {
      let err = e
      if (!err || typeof err !== 'object') {
        err = new Error('Non-object thrown: ' + e)
      }
      logger.error('Error thrown in incoming pipeline', { err })
      response.reject = errorToIlpReject(serverAddress, err)
    }
  }
}
