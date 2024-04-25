import { errorToIlpReject, isIlpError, IlpErrorCode } from 'ilp-packet'
import { HttpError } from 'koa'
import { ILPContext, ILPMiddleware } from '../rafiki'

/**
 * Catch errors that bubble back along the pipeline and convert to an ILP Reject
 *
 * Important rule! It ensures any errors thrown through the middleware pipe is converted to correct ILP
 * reject that is sent back to sender.
 */
export function createIncomingErrorHandlerMiddleware(
  serverAddress: string
): ILPMiddleware {
  return async (ctx: ILPContext, next: () => Promise<void>): Promise<void> => {
    try {
      await next()
      if (!ctx.response.rawReply) {
        ctx.services.logger.error('handler did not return a valid value.')
        throw new Error('handler did not return a value.')
      }
    } catch (e) {
      let err = e
      if (!err || typeof err !== 'object') {
        err = new Error('Non-object thrown: ' + e)
      }
      // TODO 2578: update this error message? wont this be for more than incoming pipeline? Verify. And check if maybe this was
      // added ONLY for incoming pipeline initially.
      ctx.services.logger.info({ err }, 'Error thrown in incoming pipeline')
      if (ctx.revertTotalReceived) {
        await ctx.revertTotalReceived()
      }
      if (isIlpError(err)) {
        ctx.response.reject = errorToIlpReject(serverAddress, err)
      } else {
        // TODO 2578: what does this log look like when its triggered? if its an httperror it prints the message? if not?
        ctx.services.logger.error(err instanceof HttpError && err.message)
        ctx.response.reject = errorToIlpReject(serverAddress, {
          message: 'unexpected internal error',
          ilpErrorCode: IlpErrorCode.T00_INTERNAL_ERROR,
          name: ''
        })
      }
    }
  }
}
