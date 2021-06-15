import { RafikiContext } from '../rafiki'

export function createStreamAddressMiddleware() {
  return async (
    { request, services: { streamServer }, state }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const { destination } = request.prepare
    // To preserve sender privacy, the accountId wasn't included in the original destination address.
    state.streamDestination = streamServer.decodePaymentTag(destination)
    await next()
  }
}
