import { errorToIlpReject } from 'ilp-packet'
import { ILPContext } from '../rafiki'

/**
 * Catch errors that bubble back along the pipeline and convert to an ILP Reject
 *
 * Important rule! It ensures any errors thrown through the middleware pipe is converted to correct ILP
 * reject that is sent back to sender.
 */
export function createIncomingErrorHandlerMiddleware(serverAddress: string) {
  return async (
    { response, services: { logger } }: ILPContext,
    next: () => Promise<void>
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
      logger.error({ err }, 'Error thrown in incoming pipeline')
      response.reject = errorToIlpReject(serverAddress, err)
    }
  }
}
