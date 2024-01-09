import { ContinueContext } from './routes'

export async function grantLastContinueAttemptMiddleware(
  ctx: ContinueContext,
  next: () => Promise<any>
): Promise<void> {
  await next()

  const grantService = await ctx.container.use('grantService')
  const { id: continueId } = ctx.params
  const continueToken = (ctx.headers['authorization'] as string)?.split(
    'GNAP '
  )[1]

  // TODO: middleware to fetch grant and add it to context
  const grant = await grantService.getByContinue(continueId, continueToken)
  if (grant) {
    await grantService.updateLastContinuedAt(grant.id)
  }
}
