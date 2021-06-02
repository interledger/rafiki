import { RafikiContext } from '../rafiki'

export function createStreamAddressMiddleware() {
  return async (
    { request, services: { streamServer }, state }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const { destination } = request.prepare
    const accountId = streamServer.decodePaymentTag(destination)
    if (!accountId) {
      await next()
      return
    }

    // To preserve sender privacy, the accountId wasn't included in the original destination address.
    const segments = destination.split('.')
    segments.splice(-1, 0, accountId)
    state.streamDestination = segments.join('.')
    await next()
  }
}
