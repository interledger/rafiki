import { ILPMiddleware, ILPContext } from '../rafiki'

export function createStreamAddressMiddleware(): ILPMiddleware {
  return async (
    { request, services: { streamServer }, state }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    const { destination } = request.prepare
    // To preserve sender privacy, the accountId wasn't included in the original destination address.
    state.streamDestination = streamServer.decodePaymentTag(destination)
    await next()
  }
}
